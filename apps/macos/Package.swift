// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "GallagherCresMacOS",
    defaultLocalization: "en",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "GallagherCresMacOS",
            targets: ["GallagherCresMacOS"]
        )
    ],
    targets: [
        .executableTarget(
            name: "GallagherCresMacOS",
            path: "Sources"
        )
    ]
)
