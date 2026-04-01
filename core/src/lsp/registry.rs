use std::process::Command;

use serde::Serialize;

/// Info about a language server.
#[derive(Debug, Clone, Serialize)]
pub struct ServerInfo {
    pub language_id: &'static str,
    pub display_name: &'static str,
    pub extensions: &'static [&'static str],
    pub command: &'static str,
    pub args: &'static [&'static str],
    pub install_command: &'static str,
    pub install_method: &'static str,
}

/// Resolve the full path to a server binary — checks ~/.blink/servers/ first, then PATH.
pub fn resolve_server_path(command: &str) -> Option<String> {
    // Check local servers dir first
    if let Some(home) = dirs::home_dir() {
        let local_path = home.join(".blink").join("servers").join(command);
        if local_path.exists() {
            return Some(local_path.to_string_lossy().to_string());
        }
        // Also check node_modules/.bin style
        let local_bin = home
            .join(".blink")
            .join("servers")
            .join("node_modules")
            .join(".bin")
            .join(command);
        if local_bin.exists() {
            return Some(local_bin.to_string_lossy().to_string());
        }
    }
    // Fall back to system PATH
    if command_exists(command) {
        return Some(command.to_string());
    }
    None
}

/// Known language servers and how to launch them.
pub const KNOWN_SERVERS: &[ServerInfo] = &[
    ServerInfo {
        language_id: "typescript",
        display_name: "TypeScript / JavaScript",
        extensions: &["ts", "tsx", "js", "jsx", "mjs", "cjs"],
        command: "typescript-language-server",
        args: &["--stdio"],
        install_command: "npm install -g typescript-language-server typescript",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "rust",
        display_name: "Rust",
        extensions: &["rs"],
        command: "rust-analyzer",
        args: &[],
        install_command: "brew install rust-analyzer",
        install_method: "brew",
    },
    ServerInfo {
        language_id: "python",
        display_name: "Python",
        extensions: &["py"],
        command: "pyright-langserver",
        args: &["--stdio"],
        install_command: "npm install -g pyright",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "go",
        display_name: "Go",
        extensions: &["go"],
        command: "gopls",
        args: &["serve"],
        install_command: "go install golang.org/x/tools/gopls@latest",
        install_method: "go",
    },
    ServerInfo {
        language_id: "css",
        display_name: "CSS / SCSS / Less",
        extensions: &["css", "scss", "less"],
        command: "vscode-css-language-server",
        args: &["--stdio"],
        install_command: "npm install -g vscode-langservers-extracted",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "html",
        display_name: "HTML",
        extensions: &["html", "htm"],
        command: "vscode-html-language-server",
        args: &["--stdio"],
        install_command: "npm install -g vscode-langservers-extracted",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "json",
        display_name: "JSON",
        extensions: &["json", "jsonc"],
        command: "vscode-json-language-server",
        args: &["--stdio"],
        install_command: "npm install -g vscode-langservers-extracted",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "svelte",
        display_name: "Svelte",
        extensions: &["svelte"],
        command: "svelteserver",
        args: &["--stdio"],
        install_command: "npm install -g svelte-language-server",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "vue",
        display_name: "Vue",
        extensions: &["vue"],
        command: "vue-language-server",
        args: &["--stdio"],
        install_command: "npm install -g @vue/language-server",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "tailwindcss",
        display_name: "Tailwind CSS",
        extensions: &[],
        command: "tailwindcss-language-server",
        args: &["--stdio"],
        install_command: "npm install -g @tailwindcss/language-server",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "yaml",
        display_name: "YAML",
        extensions: &["yaml", "yml"],
        command: "yaml-language-server",
        args: &["--stdio"],
        install_command: "npm install -g yaml-language-server",
        install_method: "npm",
    },
    ServerInfo {
        language_id: "toml",
        display_name: "TOML",
        extensions: &["toml"],
        command: "taplo",
        args: &["lsp", "stdio"],
        install_command: "cargo install taplo-cli --locked",
        install_method: "cargo",
    },
];

/// Find the server for a given file extension.
pub fn server_for_extension(ext: &str) -> Option<&'static ServerInfo> {
    KNOWN_SERVERS.iter().find(|s| s.extensions.contains(&ext))
}

/// Check if a command exists on the system.
pub fn command_exists(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// List all servers that are installed on this system.
pub fn installed_servers() -> Vec<&'static ServerInfo> {
    KNOWN_SERVERS
        .iter()
        .filter(|s| command_exists(s.command))
        .collect()
}
