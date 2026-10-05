//! User-facing request failures. Never display the raw error chain: it can
//! contain subscription credentials, redirect URLs or certificate subject names.

use std::error::Error;

const UNTRUSTED: &str = "The server certificate is not trusted. If this server uses a private CA, make sure you trust its owner before adding the CA to your operating system's trusted certificates. Otherwise, contact the server administrator.";
const EXPIRED: &str = "The server certificate has expired. Check your system date and time, or ask the server administrator to renew the certificate.";
const NOT_YET_VALID: &str = "The server certificate is not valid yet. Check your system date and time, or contact the server administrator.";
const HOSTNAME: &str = "The server certificate does not match the URL's hostname. Check the remote URL, or ask the server administrator to correct the certificate.";
const REVOKED: &str =
    "The server certificate has been revoked. Contact the server administrator to replace it.";
const CERTIFICATE: &str = "The server certificate could not be verified. Check your system date and time, or ask the server administrator to check the certificate chain and system trust settings.";
const TLS: &str = "A secure connection could not be established. Check the server and proxy TLS settings, or contact the server administrator.";

pub fn request_error_message(error: reqwest::Error) -> String {
    let message = if let Some(message) = tls_error_message(&error) {
        message
    } else if error.is_timeout() {
        "The request timed out. Check your network connection and try again."
    } else if error.is_redirect() {
        "The server redirect could not be followed. Check the remote URL."
    } else if error.is_connect() {
        "Could not connect to the server. Check the remote URL, network connection and proxy settings."
    } else if error.is_body() || error.is_decode() {
        "Could not read the server response. Check your network connection and try again."
    } else if error.is_builder() {
        "Could not prepare the request. Check the URL and proxy settings."
    } else {
        "The request failed. Check the remote URL, network connection and proxy settings."
    };
    message.to_string()
}

fn tls_error_message(mut error: &(dyn Error + 'static)) -> Option<&'static str> {
    loop {
        if let Some(error) = error.downcast_ref::<rustls::Error>() {
            return Some(match error {
                rustls::Error::InvalidCertificate(certificate) => certificate_message(certificate),
                _ => TLS,
            });
        }

        // io::Error::source() can skip its wrapped error. Inspect get_ref()
        // first, otherwise a rustls::Error inside an IO error may be missed.
        let next = error
            .downcast_ref::<std::io::Error>()
            .and_then(std::io::Error::get_ref)
            .map(|inner| inner as &(dyn Error + 'static))
            .or_else(|| error.source());
        error = next?;
    }
}

fn certificate_message(error: &rustls::CertificateError) -> &'static str {
    use rustls::CertificateError;

    match error {
        CertificateError::UnknownIssuer => UNTRUSTED,
        CertificateError::Expired | CertificateError::ExpiredContext { .. } => EXPIRED,
        CertificateError::NotValidYet | CertificateError::NotValidYetContext { .. } => {
            NOT_YET_VALID
        }
        CertificateError::NotValidForName | CertificateError::NotValidForNameContext { .. } => {
            HOSTNAME
        }
        CertificateError::Revoked => REVOKED,
        #[cfg(target_os = "macos")]
        CertificateError::Other(error) => macos_certificate_message(&error.0.to_string()),
        _ => CERTIFICATE,
    }
}

#[cfg(target_os = "macos")]
fn macos_certificate_message(detail: &str) -> &'static str {
    // rustls-platform-verifier 0.7 emits some Security.framework errors as
    // a localized description followed by ": <OSStatus>". Match only the
    // numeric suffix, never localized text or an untrusted certificate name.
    let status = detail
        .rsplit_once(": ")
        .and_then(|(_, status)| status.parse::<i32>().ok());
    match status {
        Some(-67843 | -67654 | -25318) => UNTRUSTED, // NotTrusted / TrustSettingDeny / CreateChainFailed
        Some(-67818) => EXPIRED,                     // CertificateExpired
        Some(-67819) => NOT_YET_VALID,               // CertificateNotValidYet
        Some(-67602) => HOSTNAME,                    // HostNameMismatch
        Some(-67820) => REVOKED,                     // CertificateRevoked
        _ => CERTIFICATE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::CertificateError;

    #[test]
    fn finds_certificate_failures_inside_nested_io_errors() {
        for (error, expected) in [
            (CertificateError::UnknownIssuer, UNTRUSTED),
            (CertificateError::Expired, EXPIRED),
            (CertificateError::NotValidYet, NOT_YET_VALID),
            (CertificateError::NotValidForName, HOSTNAME),
            (CertificateError::Revoked, REVOKED),
            (CertificateError::BadSignature, CERTIFICATE),
        ] {
            let wrapped = std::io::Error::other(std::io::Error::other(
                rustls::Error::InvalidCertificate(error),
            ));
            assert_eq!(tls_error_message(&wrapped), Some(expected));
        }
        assert_eq!(
            tls_error_message(&std::io::Error::other("connection failed")),
            None
        );
        assert_eq!(
            tls_error_message(&rustls::Error::General("handshake failed".into())),
            Some(TLS)
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn native_certificate_errors_use_status_codes_not_localized_descriptions() {
        for (detail, expected) in [
            ("certificate is not trusted: -67843", UNTRUSTED),
            ("证书已过期: -67818", EXPIRED),
            ("certificate is not valid yet: -67819", NOT_YET_VALID),
            ("explicitly denied: -67654", UNTRUSTED),
            ("certificate named expired -67818: -99999", CERTIFICATE),
            (
                "https://user:password@private.test/secret?token=secret",
                CERTIFICATE,
            ),
        ] {
            let error =
                rustls::Error::InvalidCertificate(CertificateError::Other(rustls::OtherError(
                    std::sync::Arc::from(Box::<dyn Error + Send + Sync>::from(detail)),
                )));
            assert_eq!(tls_error_message(&error), Some(expected));
        }
    }

    #[tokio::test]
    async fn connection_failures_do_not_expose_url_credentials_paths_or_queries() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let error = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap()
            .get(format!(
                "https://user:password@127.0.0.1:{port}/private-token?token=secret#fragment"
            ))
            .send()
            .await
            .unwrap_err();
        let message = request_error_message(error);
        assert!(message.contains("Could not connect"), "{message}");
        for secret in [
            "user",
            "password",
            "private-token",
            "secret",
            "fragment",
            "127.0.0.1",
        ] {
            assert!(!message.contains(secret), "{message}");
        }
    }

    #[tokio::test]
    async fn timeouts_are_not_reported_as_certificate_or_connection_failures() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/?token=secret", listener.local_addr().unwrap());
        let error = reqwest::Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_millis(50))
            .build()
            .unwrap()
            .get(url)
            .send()
            .await
            .unwrap_err();
        assert_eq!(
            request_error_message(error),
            "The request timed out. Check your network connection and try again."
        );
    }
}
