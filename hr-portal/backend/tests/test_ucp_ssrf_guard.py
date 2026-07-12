"""test_ucp_ssrf_guard — SSRF 防护校验"""
import pytest

from app.ucp.ssrf_guard import check_url, SSRFError


class TestCheckUrlWithAllowedDomains:
    def test_valid_url_with_domain_whitelist(self):
        result = check_url("https://api.example.com/data",
                           allowed_domains=["api.example.com"])
        assert "api.example.com" in result

    def test_valid_url_with_wildcard_domain(self):
        result = check_url("https://api.internal.example.com/data",
                           allowed_domains=["*.internal.example.com"])
        assert "api.internal.example.com" in result

    def test_domain_not_in_whitelist_raises(self):
        with pytest.raises(SSRFError):
            check_url("https://evil.com/api", allowed_domains=["example.com"])

    def test_strict_mode_rejects_hostname_without_whitelist(self):
        with pytest.raises(SSRFError):
            check_url("https://example.com/api")


class TestBlockedHostnamePatterns:
    def test_localhost_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://localhost:8080/api", allowed_domains=["*"])

    def test_metadata_google_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://metadata.google.internal/", allowed_domains=["*"])

    def test_aws_metadata_ip_blocked_by_pattern(self):
        with pytest.raises(SSRFError):
            check_url("http://169.254.169.254/latest/meta-data/",
                      allowed_domains=["*"])


class TestBlockedIpRanges:
    def test_loopback_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://127.0.0.1/api", allowed_domains=["*"])

    def test_private_10_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://10.0.0.1/api", allowed_domains=["*"])

    def test_private_172_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://172.16.0.1/api", allowed_domains=["*"])

    def test_private_192_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://192.168.1.1/api", allowed_domains=["*"])

    def test_link_local_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://169.254.1.1/api", allowed_domains=["*"])

    def test_zero_network_blocked(self):
        with pytest.raises(SSRFError):
            check_url("http://0.0.0.0/api", allowed_domains=["*"])


class TestInvalidInput:
    def test_empty_string_raises(self):
        with pytest.raises(SSRFError):
            check_url("")

    def test_non_http_protocol_raises(self):
        with pytest.raises(SSRFError):
            check_url("ftp://example.com/file")

    def test_malformed_url_raises(self):
        with pytest.raises(SSRFError):
            check_url("not-a-url-at-all")


class TestPublicIpAllowed:
    def test_public_ip_allowed_with_wildcard_domain(self):
        result = check_url("https://8.8.8.8/", allowed_domains=["*"])
        assert "8.8.8.8" in result

    def test_url_with_path_and_query_allowed(self):
        result = check_url("https://example.com/api/v1/data?page=1&size=10",
                           allowed_domains=["example.com"])
        assert "example.com" in result
