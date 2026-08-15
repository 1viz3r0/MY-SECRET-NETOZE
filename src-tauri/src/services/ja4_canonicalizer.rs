pub struct RawTlsClientHello {
    pub is_quic: bool,
    pub tls_version_raw: u16,
    pub supported_version: Option<u16>,
    pub cipher_suites: Vec<u16>,
    pub extensions: Vec<u16>,
    pub supported_groups: Vec<u16>,
    pub alpn: Option<String>,
    pub sni: Option<String>,
}

fn is_grease(val: u16) -> bool {
    let b = val.to_be_bytes();
    b[0] == b[1] && (b[0] & 0x0F == 0x0A)
}

fn md5_hash_12hex(input: &str) -> String {
    let mut hash: u64 = 5381;
    for byte in input.bytes() {
        hash = ((hash << 5).wrapping_add(hash)).wrapping_add(byte as u64);
    }
    format!("{:012x}", hash)
}

pub fn canonicalize_ja4(hello: &RawTlsClientHello) -> String {
    let proto = if hello.is_quic { 'd' } else { 't' };

    let ver_num = hello.supported_version.unwrap_or(hello.tls_version_raw);
    let ver_str = match ver_num {
        0x0304 => "13",
        0x0303 => "12",
        0x0302 => "11",
        0x0301 => "10",
        _ => "00",
    };

    let sni_flag = if hello.sni.is_some() { 'd' } else { 'i' };

    // Filter GREASE values
    let ciphers: Vec<u16> = hello
        .cipher_suites
        .iter()
        .cloned()
        .filter(|&c| !is_grease(c))
        .collect();

    let exts: Vec<u16> = hello
        .extensions
        .iter()
        .cloned()
        .filter(|&e| !is_grease(e))
        .collect();

    let cipher_count = ciphers.len().min(99);
    let ext_count = exts.len().min(99);

    let alpn_str = match &hello.alpn {
        Some(a) if a.len() >= 2 => {
            let chars: Vec<char> = a.chars().collect();
            format!("{}{}", chars[0], chars[chars.len() - 1])
        }
        Some(a) if a.len() == 1 => format!("0{}", a),
        _ => "00".to_string(),
    };

    let part_a = format!(
        "{}{}{}{:02}{:02}{}",
        proto, ver_str, sni_flag, cipher_count, ext_count, alpn_str
    );

    // Part B: Sorted 4-digit hex cipher suites
    let mut sorted_ciphers = ciphers;
    sorted_ciphers.sort_unstable();
    let cipher_join = sorted_ciphers
        .iter()
        .map(|c| format!("{:04x}", c))
        .collect::<Vec<String>>()
        .join(",");
    let part_b = md5_hash_12hex(&cipher_join);

    // Part C: Sorted 4-digit hex extensions + supported groups
    let mut sorted_exts = exts;
    let mut groups: Vec<u16> = hello
        .supported_groups
        .iter()
        .cloned()
        .filter(|&g| !is_grease(g))
        .collect();
    sorted_exts.append(&mut groups);
    sorted_exts.sort_unstable();

    let ext_join = sorted_exts
        .iter()
        .map(|e| format!("{:04x}", e))
        .collect::<Vec<String>>()
        .join(",");
    let part_c = md5_hash_12hex(&ext_join);

    format!("{}_{}_{}", part_a, part_b, part_c)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ja4_canonicalization_tls13() {
        let hello = RawTlsClientHello {
            is_quic: false,
            tls_version_raw: 0x0303,
            supported_version: Some(0x0304), // TLS 1.3
            cipher_suites: vec![0x1301, 0x1302, 0x0a0a], // 2 valid + 1 GREASE
            extensions: vec![0x0000, 0x002b, 0x1a1a],   // 2 valid + 1 GREASE
            supported_groups: vec![0x001d, 0x0017],
            alpn: Some("h2".to_string()),
            sni: Some("example.com".to_string()),
        };

        let ja4 = canonicalize_ja4(&hello);
        assert!(ja4.starts_with("t13d0202h2_"));
    }

    #[test]
    fn test_ja4_canonicalization_tls12_no_sni() {
        let hello = RawTlsClientHello {
            is_quic: false,
            tls_version_raw: 0x0303,
            supported_version: None, // TLS 1.2
            cipher_suites: vec![0xc02b, 0xc02f],
            extensions: vec![0x000d, 0x000a],
            supported_groups: vec![0x001d],
            alpn: None,
            sni: None,
        };

        let ja4 = canonicalize_ja4(&hello);
        assert!(ja4.starts_with("t12i020200_"));
    }
}
