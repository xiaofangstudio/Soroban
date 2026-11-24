#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|a| a == "--mcp") {
        std::process::exit(soroban_lib::mcp::run_stdio());
    }
    soroban_lib::run()
}
