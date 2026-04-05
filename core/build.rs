fn main() {
    // Ensure bridge/ide-bridge.js exists so include_str! in blink_code_bridge.rs
    // doesn't fail in dev mode (where bun run bundle:bridge hasn't been run yet).
    let bridge_path = std::path::Path::new("bridge/ide-bridge.js");
    if !bridge_path.exists() {
        std::fs::create_dir_all("bridge").expect("failed to create bridge dir");
        std::fs::write(bridge_path, b"").expect("failed to write bridge placeholder");
    }
    println!("cargo:rerun-if-changed=bridge/ide-bridge.js");

    tauri_build::build()
}
