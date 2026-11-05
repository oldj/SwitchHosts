//! Local CONNECT proxy and TLS fixture with fresh, short-lived certificates.
//! Tests configure this explicit proxy to avoid the machine's system proxy.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;

use rcgen::{
    BasicConstraints, CertificateParams, DnType, ExtendedKeyUsagePurpose, IsCa, Issuer, KeyPair,
    KeyUsagePurpose,
};
use rustls::pki_types::PrivateKeyDer;

pub(crate) const CA_PEM: &str = include_str!("fixtures/ca.pem");

pub(crate) struct TlsServer {
    pub url: String,
    pub ca_pem: String,
    stop: Arc<AtomicBool>,
    worker: Option<std::thread::JoinHandle<()>>,
}

impl TlsServer {
    pub(crate) fn configure_proxy(&self, state: &crate::storage::AppState) {
        let mut config = state.config.lock().unwrap();
        config.use_proxy = true;
        config.proxy_protocol = "http".into();
        config.proxy_host = "127.0.0.1".into();
        config.proxy_port = reqwest::Url::parse(&self.url).unwrap().port().unwrap() as u32;
    }

    pub(crate) fn new(expired: bool) -> Self {
        let now = time::OffsetDateTime::now_utc();
        let mut ca = CertificateParams::default();
        ca.distinguished_name
            .push(DnType::CommonName, "SwitchHosts test CA");
        ca.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        ca.key_usages = vec![KeyUsagePurpose::KeyCertSign, KeyUsagePurpose::CrlSign];
        ca.not_before = now - time::Duration::days(30);
        ca.not_after = now + time::Duration::days(30);
        let ca_key = KeyPair::generate().unwrap();
        let ca_pem = ca.self_signed(&ca_key).unwrap().pem();
        let issuer = Issuer::new(ca, ca_key);
        let mut leaf = CertificateParams::new(vec!["localhost".into()]).unwrap();
        leaf.distinguished_name
            .push(DnType::CommonName, "localhost");
        leaf.key_usages = vec![KeyUsagePurpose::DigitalSignature];
        leaf.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        leaf.use_authority_key_identifier_extension = true;
        leaf.not_before = now - time::Duration::days(3);
        leaf.not_after = now + time::Duration::days(if expired { -1 } else { 1 });
        let key = KeyPair::generate().unwrap();
        let certificate = leaf.signed_by(&key, &issuer).unwrap();
        let config = rustls::ServerConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(
            vec![certificate.der().clone()],
            PrivateKeyDer::Pkcs8(key.serialize_der().into()),
        )
        .unwrap();
        let config = Arc::new(config);
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let done = stop.clone();
        let worker = std::thread::spawn(move || {
            while !done.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => serve(stream, config.clone()),
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("TLS test listener: {error}"),
                }
            }
        });
        Self {
            url: format!("https://localhost:{}/hosts", address.port()),
            ca_pem,
            stop,
            worker: Some(worker),
        }
    }
}

fn serve(mut stream: TcpStream, config: Arc<rustls::ServerConfig>) {
    stream.set_nonblocking(false).unwrap();
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    stream
        .set_write_timeout(Some(Duration::from_secs(3)))
        .unwrap();
    let Ok(request) = read_headers(&mut stream) else {
        return;
    };
    assert!(request.starts_with(b"CONNECT "));
    stream
        .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        .unwrap();
    let connection = rustls::ServerConnection::new(config).unwrap();
    let mut tls = rustls::StreamOwned::new(connection, stream);
    if read_headers(&mut tls).is_err() {
        return;
    } // Rejected handshakes are expected.
    let body = "192.0.2.46 custom-ca.test\n";
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = tls.write_all(response.as_bytes());
    let _ = tls.flush();
}

fn read_headers(stream: &mut impl Read) -> std::io::Result<Vec<u8>> {
    let mut request = Vec::new();
    let mut buffer = [0; 1024];
    while !request.windows(4).any(|bytes| bytes == b"\r\n\r\n") {
        let count = stream.read(&mut buffer)?;
        if count == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        request.extend_from_slice(&buffer[..count]);
    }
    Ok(request)
}

impl Drop for TlsServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        self.worker.take().unwrap().join().unwrap();
    }
}

#[test]
fn custom_ca_parser_rejects_empty_bundles_bad_der_private_keys_and_oversize_input() {
    use super::custom_ca_certificates;
    assert!(custom_ca_certificates("").unwrap().is_empty());
    assert!(custom_ca_certificates(" \n").unwrap().is_empty());
    assert_eq!(custom_ca_certificates(CA_PEM).unwrap().len(), 1);
    assert_eq!(
        custom_ca_certificates(&format!("{CA_PEM}\n{CA_PEM}"))
            .unwrap()
            .len(),
        2
    );
    for pem in [
        "not a certificate".into(),
        "-----BEGIN CERTIFICATE-----\n!!!!\n-----END CERTIFICATE-----".into(),
        "-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----".into(),
        format!("{CA_PEM}\n-----BEGIN CERTIFICATE-----\nYWJj\n-----END CERTIFICATE-----"),
        format!("{CA_PEM}\n-----BEGIN PRIVATE KEY-----\nYWJj\n-----END PRIVATE KEY-----"),
        "x".repeat(super::MAX_CUSTOM_CA_BYTES + 1),
    ] {
        assert!(custom_ca_certificates(&pem).is_err());
    }
}
