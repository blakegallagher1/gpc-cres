import SwiftUI
import WebKit

@MainActor
final class BrowserController {
    weak var webView: WKWebView?
    private var pendingURL: URL?

    func attach(webView: WKWebView) {
        self.webView = webView

        if let pendingURL {
            let request = URLRequest(url: pendingURL)
            webView.load(request)
            self.pendingURL = nil
        }
    }

    func navigate(to url: URL) {
        if let webView {
            webView.load(URLRequest(url: url))
        } else {
            pendingURL = url
        }
    }

    func reload() {
        webView?.reload()
    }

    func goBack() {
        webView?.goBack()
    }

    func goForward() {
        webView?.goForward()
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

    func makeCoordinator() -> Coordinator {
        Coordinator(allowedHost: allowedHost, onNavigationStateChange: onNavigationStateChange)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.setValue(false, forKey: "drawsBackground")

        controller.attach(webView: webView)
        controller.navigate(to: initialURL)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.allowedHost = allowedHost
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var allowedHost: String?
        private let onNavigationStateChange: @MainActor (BrowserNavigationState) -> Void

        init(
            allowedHost: String?,
            onNavigationStateChange: @escaping @MainActor (BrowserNavigationState) -> Void
        ) {
            self.allowedHost = allowedHost
            self.onNavigationStateChange = onNavigationStateChange
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
            publishState(for: webView, isLoading: false)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            publishState(for: webView, isLoading: false)
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            publishState(for: webView, isLoading: false)
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
    }
}
