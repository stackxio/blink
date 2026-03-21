use std::io::{BufRead, BufReader, Read, Write};
use std::process::ChildStdin;

/// Encode a JSON-RPC message with Content-Length header for LSP.
pub fn encode_message(body: &str) -> Vec<u8> {
    format!("Content-Length: {}\r\n\r\n{}", body.len(), body).into_bytes()
}

/// Read a single LSP message from a buffered reader.
/// Returns the JSON body as a string.
pub fn read_message<R: Read>(reader: &mut BufReader<R>) -> Option<String> {
    // Read headers
    let mut content_length: usize = 0;
    loop {
        let mut line = String::new();
        match reader.read_line(&mut line) {
            Ok(0) => return None, // EOF
            Ok(_) => {
                let line = line.trim();
                if line.is_empty() {
                    break; // End of headers
                }
                if let Some(len_str) = line.strip_prefix("Content-Length: ") {
                    content_length = len_str.parse().unwrap_or(0);
                }
            }
            Err(_) => return None,
        }
    }

    if content_length == 0 {
        return None;
    }

    // Read body
    let mut body = vec![0u8; content_length];
    match reader.read_exact(&mut body) {
        Ok(()) => String::from_utf8(body).ok(),
        Err(_) => None,
    }
}

/// Write an LSP message to a writer (typically the server's stdin).
pub fn write_message(writer: &mut ChildStdin, body: &str) -> std::io::Result<()> {
    let encoded = encode_message(body);
    writer.write_all(&encoded)?;
    writer.flush()
}
