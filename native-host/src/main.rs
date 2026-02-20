// FocusTogether Native Messaging Host
// Allows Chrome extension to get user ID from the desktop app config

use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

#[derive(Deserialize)]
struct Request {
    #[serde(rename = "type")]
    request_type: String,
}

#[derive(Serialize)]
struct Response {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Deserialize)]
struct Config {
    user_id: Option<String>,
}

fn read_message() -> io::Result<String> {
    let mut stdin = io::stdin();
    
    // Read 4-byte length prefix (native byte order = little-endian on most platforms)
    let mut length_bytes = [0u8; 4];
    stdin.read_exact(&mut length_bytes)?;
    let length = u32::from_ne_bytes(length_bytes) as usize;
    
    // Sanity check - Chrome limits messages to 1MB
    if length > 1024 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Message too large"));
    }
    
    // Read the JSON message
    let mut buffer = vec![0u8; length];
    stdin.read_exact(&mut buffer)?;
    
    String::from_utf8(buffer)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
}

fn write_message(response: &Response) -> io::Result<()> {
    let json = serde_json::to_string(response)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    
    let bytes = json.as_bytes();
    let length = bytes.len() as u32;
    
    let mut stdout = io::stdout();
    
    // Write 4-byte length prefix
    stdout.write_all(&length.to_ne_bytes())?;
    
    // Write the JSON
    stdout.write_all(bytes)?;
    stdout.flush()?;
    
    Ok(())
}

fn get_user_id() -> Option<String> {
    // Read config from ~/.focustogether/config.json
    let home = dirs::home_dir()?;
    let config_path = home.join(".focustogether").join("config.json");
    
    let config_str = std::fs::read_to_string(config_path).ok()?;
    let config: Config = serde_json::from_str(&config_str).ok()?;
    
    config.user_id
}

fn handle_request(request_json: &str) -> Response {
    // Parse the request
    let request: Result<Request, _> = serde_json::from_str(request_json);
    
    match request {
        Ok(req) => {
            match req.request_type.as_str() {
                "GET_USER_ID" => {
                    match get_user_id() {
                        Some(user_id) => Response {
                            success: true,
                            user_id: Some(user_id),
                            error: None,
                        },
                        None => Response {
                            success: false,
                            user_id: None,
                            error: Some("Desktop app not connected to an account".to_string()),
                        },
                    }
                }
                "PING" => Response {
                    success: true,
                    user_id: None,
                    error: None,
                },
                _ => Response {
                    success: false,
                    user_id: None,
                    error: Some(format!("Unknown request type: {}", req.request_type)),
                },
            }
        }
        Err(e) => Response {
            success: false,
            user_id: None,
            error: Some(format!("Invalid request: {}", e)),
        },
    }
}

fn main() {
    // Read one message, respond, and exit
    // Chrome starts a new process for each sendNativeMessage() call
    match read_message() {
        Ok(request_json) => {
            let response = handle_request(&request_json);
            if let Err(e) = write_message(&response) {
                eprintln!("Failed to write response: {}", e);
            }
        }
        Err(e) => {
            eprintln!("Failed to read message: {}", e);
            // Try to send an error response
            let response = Response {
                success: false,
                user_id: None,
                error: Some(format!("Failed to read message: {}", e)),
            };
            let _ = write_message(&response);
        }
    }
}
