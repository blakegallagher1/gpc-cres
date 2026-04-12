import SwiftUI
import WebKit

struct BrowserProbeResult {
    let statusCode: Int?
    let payload: [String: Any]?
    let errorMessage: String?
}

@MainActor
final class BrowserController {
    weak var webView: WKWebView?
    private var pendingURL: URL?
    private var sessionBridge: SessionBridge?
    private var lastRequestedURL: URL?
    private var didInjectSessionCookieInPage = false
    private var didResetWebsiteDataForSessionBridge = false

    private struct SessionBridge: Equatable {
        let host: String
        let secure: Bool
        let token: String?

        var cookieName: String {
            secure ? "__Secure-authjs.session-token" : "authjs.session-token"
        }
    }

    func attach(webView: WKWebView) {
        self.webView = webView

        Task { [weak self, weak webView] in
            guard let self, let webView else { return }
            await self.applySessionBridgeIfNeeded(to: webView)

            if let pendingURL = self.pendingURL {
                webView.load(self.navigationRequest(for: pendingURL))
                self.pendingURL = nil
            }
        }
    }

    func navigate(to url: URL) {
        lastRequestedURL = url
        if let webView {
            Task { [weak self, weak webView] in
                guard let self, let webView else { return }
                await self.applySessionBridgeIfNeeded(to: webView)
                webView.load(self.navigationRequest(for: url))
            }
        } else {
            pendingURL = url
        }
    }

    func reload() {
        if let webView {
            Task { [weak self, weak webView] in
                guard let self, let webView else { return }
                await self.applySessionBridgeIfNeeded(to: webView)
                webView.reload()
            }
        }
    }

    func goBack() {
        webView?.goBack()
    }

    func goForward() {
        webView?.goForward()
    }

    func configureSessionBridge(baseURL: String, bearerToken: String) {
        let trimmedToken = bearerToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: baseURL),
              let host = url.host else {
            sessionBridge = nil
            return
        }

        guard trimmedToken.isEmpty == false else {
            sessionBridge = nil
            return
        }

        sessionBridge = SessionBridge(
            host: host,
            secure: url.scheme?.lowercased() == "https",
            token: trimmedToken
        )
        didInjectSessionCookieInPage = false
        didResetWebsiteDataForSessionBridge = false

        if let webView {
            Task { [weak self, weak webView] in
                guard let self, let webView else { return }
                await self.applySessionBridgeIfNeeded(to: webView)
            }
        }
    }

    func fetchJSONUsingPageSession(path: String) async -> BrowserProbeResult? {
        guard let webView else { return nil }

        do {
            let result = try await webView.callAsyncJavaScript(
                """
                const response = await fetch(path, {
                  credentials: "include",
                  headers: { "Accept": "application/json" }
                });

                let payload = null;
                try {
                  payload = await response.json();
                } catch {}

                return {
                  statusCode: response.status,
                  payload
                };
                """,
                arguments: ["path": path],
                in: nil,
                contentWorld: .page
            )

            guard let dictionary = result as? [String: Any] else {
                return BrowserProbeResult(statusCode: nil, payload: nil, errorMessage: "Page session returned an unexpected payload.")
            }

            return BrowserProbeResult(
                statusCode: dictionary["statusCode"] as? Int,
                payload: dictionary["payload"] as? [String: Any],
                errorMessage: nil
            )
        } catch {
            return BrowserProbeResult(statusCode: nil, payload: nil, errorMessage: error.localizedDescription)
        }
    }

    func handleCompletedNavigation(in webView: WKWebView) async {
        guard let sessionBridge,
              let token = sessionBridge.token,
              didInjectSessionCookieInPage == false,
              webView.url?.host == sessionBridge.host else {
            return
        }

        let injected = ((try? await webView.callAsyncJavaScript(
            """
            document.cookie = `${cookieName}=${token}; path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
            return document.cookie.includes(cookieName + "=");
            """,
            arguments: [
                "cookieName": sessionBridge.cookieName,
                "token": token,
                "secure": sessionBridge.secure,
            ],
            in: nil,
            contentWorld: .page
        )) as? Bool) ?? false

        guard injected else { return }
        didInjectSessionCookieInPage = true

        if let lastRequestedURL,
           webView.url?.path == "/login",
           lastRequestedURL.path != "/login" {
            webView.load(navigationRequest(for: lastRequestedURL))
            return
        }

        if let currentURL = webView.url,
           currentURL.path != "/login" {
            webView.load(navigationRequest(for: currentURL))
        }
    }

    private func applySessionBridgeIfNeeded(to webView: WKWebView) async {
        guard let sessionBridge else { return }

        let dataStore = webView.configuration.websiteDataStore
        if didResetWebsiteDataForSessionBridge == false {
            await clearWebsiteData(for: sessionBridge.host, in: dataStore)
            didResetWebsiteDataForSessionBridge = true
        }

        let store = dataStore.httpCookieStore
        let allCookies = await loadCookies(from: store)
        let managedCookies = allCookies.filter { cookie in
            Self.isManagedSessionCookie(cookie, host: sessionBridge.host)
        }

        for cookie in managedCookies {
            let isDesiredCookie = cookie.name == sessionBridge.cookieName
                && cookie.value == sessionBridge.token
                && cookie.isSecure == sessionBridge.secure

            if isDesiredCookie == false {
                await deleteCookie(cookie, from: store)
            }
        }

        guard let token = sessionBridge.token,
              managedCookies.contains(where: {
                  $0.name == sessionBridge.cookieName
                      && $0.value == token
                      && $0.isSecure == sessionBridge.secure
              }) == false,
              let cookie = Self.makeSessionCookie(
                  host: sessionBridge.host,
                  secure: sessionBridge.secure,
                  name: sessionBridge.cookieName,
                  value: token
              ) else {
            return
        }

        await setCookie(cookie, in: store)
    }

    private func loadCookies(from store: WKHTTPCookieStore) async -> [HTTPCookie] {
        await withCheckedContinuation { continuation in
            store.getAllCookies { cookies in
                continuation.resume(returning: cookies)
            }
        }
    }

    private func setCookie(_ cookie: HTTPCookie, in store: WKHTTPCookieStore) async {
        HTTPCookieStorage.shared.setCookie(cookie)
        await withCheckedContinuation { continuation in
            store.setCookie(cookie) {
                continuation.resume(returning: ())
            }
        }
    }

    private func deleteCookie(_ cookie: HTTPCookie, from store: WKHTTPCookieStore) async {
        HTTPCookieStorage.shared.deleteCookie(cookie)
        await withCheckedContinuation { continuation in
            store.delete(cookie) {
                continuation.resume(returning: ())
            }
        }
    }

    private func clearWebsiteData(for host: String, in store: WKWebsiteDataStore) async {
        let dataTypes = WKWebsiteDataStore.allWebsiteDataTypes()
        let records = await withCheckedContinuation { continuation in
            store.fetchDataRecords(ofTypes: dataTypes) { records in
                continuation.resume(returning: records)
            }
        }

        let matchingRecords = records.filter { record in
            record.displayName == host || record.displayName.hasSuffix(".\(host)")
        }

        guard matchingRecords.isEmpty == false else { return }

        await withCheckedContinuation { continuation in
            store.removeData(ofTypes: dataTypes, for: matchingRecords) {
                continuation.resume(returning: ())
            }
        }
    }

    private func navigationRequest(for url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData

        if let sessionBridge,
           let token = sessionBridge.token,
           url.host == sessionBridge.host {
            request.setValue(
                "\(sessionBridge.cookieName)=\(token)",
                forHTTPHeaderField: "Cookie"
            )
        }

        return request
    }

    private static func isManagedSessionCookie(_ cookie: HTTPCookie, host: String) -> Bool {
        let normalizedDomain = cookie.domain.hasPrefix(".")
            ? String(cookie.domain.dropFirst())
            : cookie.domain

        let matchesHost = normalizedDomain == host || host.hasSuffix(".\(normalizedDomain)")
        let managedPrefixes = ["authjs.session-token", "__Secure-authjs.session-token"]
        let matchesCookieFamily = managedPrefixes.contains { prefix in
            cookie.name == prefix || cookie.name.hasPrefix("\(prefix).")
        }
        return matchesHost && matchesCookieFamily
    }

    private static func makeSessionCookie(
        host: String,
        secure: Bool,
        name: String,
        value: String
    ) -> HTTPCookie? {
        var properties: [HTTPCookiePropertyKey: Any] = [
            .domain: host,
            .path: "/",
            .name: name,
            .value: value,
            .discard: "TRUE",
        ]
        properties[.secure] = secure ? "TRUE" : "FALSE"
        return HTTPCookie(properties: properties)
    }
}

struct BrowserNavigationState: Equatable {
    let urlString: String
    let title: String
    let canGoBack: Bool
    let canGoForward: Bool
    let isLoading: Bool
}

struct DesktopWebView: NSViewRepresentable {
    let controller: BrowserController
    let allowedHost: String?
    let initialURL: URL
    let onNavigationStateChange: @MainActor (BrowserNavigationState) -> Void
    let onNavigationError: @MainActor (String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(
            controller: controller,
            allowedHost: allowedHost,
            onNavigationStateChange: onNavigationStateChange,
            onNavigationError: onNavigationError
        )
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.setValue(true, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .windowBackgroundColor

        controller.attach(webView: webView)
        controller.navigate(to: initialURL)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.allowedHost = allowedHost
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        let controller: BrowserController
        var allowedHost: String?
        private let onNavigationStateChange: @MainActor (BrowserNavigationState) -> Void
        private let onNavigationError: @MainActor (String) -> Void

        init(
            controller: BrowserController,
            allowedHost: String?,
            onNavigationStateChange: @escaping @MainActor (BrowserNavigationState) -> Void,
            onNavigationError: @escaping @MainActor (String) -> Void
        ) {
            self.controller = controller
            self.allowedHost = allowedHost
            self.onNavigationStateChange = onNavigationStateChange
            self.onNavigationError = onNavigationError
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            publishState(for: webView, isLoading: true)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            Task { await controller.handleCompletedNavigation(in: webView) }
            publishState(for: webView, isLoading: false)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            publishState(for: webView, isLoading: false)
            publishError(error.localizedDescription)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            publishState(for: webView, isLoading: false)
            publishError(error.localizedDescription)
        }

        private func publishState(for webView: WKWebView, isLoading: Bool) {
            let state = BrowserNavigationState(
                urlString: webView.url?.absoluteString ?? "",
                title: webView.title ?? "Entitlement OS",
                canGoBack: webView.canGoBack,
                canGoForward: webView.canGoForward,
                isLoading: isLoading
            )

            Task { @MainActor in
                onNavigationStateChange(state)
            }
        }

        private func publishError(_ message: String) {
            Task { @MainActor in
                onNavigationError(message)
            }
        }
    }
}
