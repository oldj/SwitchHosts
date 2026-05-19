fn main() {
    // Inject version from `src/version.json` as compile-time environment
    // variables. The file is a JSON string like `"5.0.0"` (semver).
    //
    // Emits:
    //   SWH_VERSION       e.g. "5.0.0"
    //   SWH_VERSION_LABEL e.g. "v5.0.0"
    let version_path = std::path::Path::new("../src/version.json");
    println!("cargo:rerun-if-changed={}", version_path.display());

    let content = std::fs::read_to_string(version_path)
        .expect("failed to read src/version.json — is it present at the repo root?");
    let version: String = serde_json::from_str(&content)
        .expect("src/version.json must be a JSON string like \"5.0.0\"");

    println!("cargo:rustc-env=SWH_VERSION={version}");
    println!("cargo:rustc-env=SWH_VERSION_LABEL=v{version}");

    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=framework=Security");

    tauri_build::build()
}
