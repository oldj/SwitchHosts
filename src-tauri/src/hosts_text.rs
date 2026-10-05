//! Text boundaries for hosts files. Managed entries remain UTF-8; only the
//! existing Windows system file may fall back to the machine's ANSI code page.

use std::io;

/// Remove BOMs before records (including BOMs left by concatenated sources),
/// preserving indentation and comment text, and normalize line endings to LF.
pub(crate) fn normalize(content: &str) -> String {
    let lf = content.replace("\r\n", "\n").replace('\r', "\n");
    let mut result = String::with_capacity(lf.len());
    for line in lf.split_inclusive('\n') {
        let rest = line.trim_start_matches([' ', '\t', '\u{feff}']);
        let prefix = &line[..line.len() - rest.len()];
        result.extend(prefix.chars().filter(|&c| c != '\u{feff}'));
        result.push_str(rest);
    }
    result
}

fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.into())
}

/// Decode without replacement characters. A declared Unicode encoding must
/// never fall back to ANSI on malformed input. Keep text unnormalized here so
/// comparisons/recovery can distinguish the old file from the new output.
pub(crate) fn decode_system(bytes: &[u8]) -> io::Result<String> {
    let text = if bytes.starts_with(b"\xff\xfe\0\0") || bytes.starts_with(b"\0\0\xfe\xff") {
        return Err(invalid("UTF-32 hosts files are not supported"));
    } else if bytes.starts_with(b"\xff\xfe") || bytes.starts_with(b"\xfe\xff") {
        let little_endian = bytes[0] == 0xff;
        let body = &bytes[2..];
        if body.len() % 2 != 0 {
            return Err(invalid("incomplete UTF-16 hosts file"));
        }
        let units: Vec<u16> = body
            .chunks_exact(2)
            .map(|b| {
                if little_endian {
                    u16::from_le_bytes([b[0], b[1]])
                } else {
                    u16::from_be_bytes([b[0], b[1]])
                }
            })
            .collect();
        String::from_utf16(&units).map_err(|e| invalid(e.to_string()))?
    } else {
        // NULs often indicate an unmarked UTF-16 file, not an ANSI document.
        if bytes.contains(&0) {
            return Err(invalid("hosts file contains NUL bytes"));
        }
        match std::str::from_utf8(bytes) {
            Ok(text) => text.to_owned(),
            Err(e) => {
                if bytes.starts_with(b"\xef\xbb\xbf") {
                    return Err(invalid(format!("invalid UTF-8 hosts file: {e}")));
                }
                #[cfg(target_os = "windows")]
                {
                    use windows_sys::Win32::Globalization::GetACP;
                    decode_code_page(bytes, unsafe { GetACP() })?
                }
                #[cfg(not(target_os = "windows"))]
                return Err(invalid(format!("invalid UTF-8 hosts file: {e}")));
            }
        }
    };
    if text.contains('\0') {
        return Err(invalid("hosts file contains NUL characters"));
    }
    Ok(text)
}

#[cfg(target_os = "windows")]
fn decode_code_page(bytes: &[u8], code_page: u32) -> io::Result<String> {
    use windows_sys::Win32::Globalization::{MultiByteToWideChar, MB_ERR_INVALID_CHARS};

    let len = i32::try_from(bytes.len()).map_err(|_| invalid("hosts file is too large"))?;
    let error = || {
        invalid(format!(
            "cannot decode hosts file using Windows code page {code_page}: {}",
            io::Error::last_os_error()
        ))
    };
    // Explicit lengths, followed by a correctly sized UTF-16 buffer. The flag
    // makes truncated/invalid multibyte sequences fail instead of being lost.
    let size = unsafe {
        MultiByteToWideChar(
            code_page,
            MB_ERR_INVALID_CHARS,
            bytes.as_ptr(),
            len,
            std::ptr::null_mut(),
            0,
        )
    };
    if size == 0 {
        return Err(error());
    }
    let mut wide = vec![0u16; size as usize];
    let written = unsafe {
        MultiByteToWideChar(
            code_page,
            MB_ERR_INVALID_CHARS,
            bytes.as_ptr(),
            len,
            wide.as_mut_ptr(),
            size,
        )
    };
    if written == 0 {
        return Err(error());
    }
    String::from_utf16(&wide[..written as usize]).map_err(|e| invalid(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_concatenated_boms_without_changing_comments_or_indentation() {
        assert_eq!(
            normalize(
                "\u{feff}127.0.0.1 a\r\n\r\n \t\u{feff}\u{feff}::1 b\r# keep \u{feff} here\n"
            ),
            "127.0.0.1 a\n\n \t::1 b\n# keep \u{feff} here\n"
        );
    }

    #[test]
    fn decodes_unicode_strictly() {
        let text = "# 中文\r\n127.0.0.1 example.test\r\n";
        assert_eq!(decode_system(text.as_bytes()).unwrap(), text);
        let bom_text = format!("\u{feff}{text}");
        assert_eq!(decode_system(bom_text.as_bytes()).unwrap(), bom_text);
        for little in [true, false] {
            let mut bytes = if little {
                vec![0xff, 0xfe]
            } else {
                vec![0xfe, 0xff]
            };
            for unit in text.encode_utf16() {
                bytes.extend(if little {
                    unit.to_le_bytes()
                } else {
                    unit.to_be_bytes()
                });
            }
            assert_eq!(decode_system(&bytes).unwrap(), text);
        }
        for bytes in [
            b"\xef\xbb\xbf\xff".as_slice(),
            b"\xff\xfe\x00",
            b"\xff\xfe\x00\xd8",
            b"a\0b",
            b"\xff\xfe\0\0",
        ] {
            assert!(decode_system(bytes).is_err(), "{bytes:?}");
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn decodes_legacy_code_pages_without_replacing_invalid_bytes() {
        assert_eq!(
            decode_code_page(b"# \xd6\xd0\xce\xc4\r\n", 936).unwrap(),
            "# 中文\r\n"
        );
        assert_eq!(decode_code_page(b"# caf\xe9", 1252).unwrap(), "# café");
        assert!(decode_code_page(b"# \x81", 936).is_err());
        assert!(decode_code_page(b"# \xff", 65001).is_err());
    }
}
