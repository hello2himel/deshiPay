-- Enrich the reserved-username list: protect site routes, anchors, support and
-- system words, and the names of payment providers/banks that could be used to
-- impersonate them. Keep in sync with RESERVED in site/public/js/common.js.
--
-- The original list lives in 20261101120000_init.sql; this migration replaces
-- the function so existing projects get the larger list on the next push.

create or replace function public.is_reserved_username(u text)
returns boolean
language sql
immutable
as $$
  select u = any (array[
    '2fa', 'about', 'abuse', 'account', 'admin', 'admin-team', 'administrator', 'affiliate',
    'affiliates', 'agrani', 'alpha', 'amex', 'api', 'app', 'assets', 'auth',
    'bank', 'banks', 'beta', 'billing', 'binance', 'bkash', 'blog', 'brac',
    'bracbank', 'callback', 'careers', 'cart', 'cause', 'causes', 'checkout', 'citybank',
    'coming-soon', 'complaint', 'complaints', 'contact', 'cookies', 'copyright', 'css', 'customer-service',
    'customerservice', 'dashboard', 'dbbl', 'demo', 'deshi-pay', 'deshi-qr', 'deshipay', 'deshipays',
    'deshiqr', 'dev', 'develop', 'development', 'dmca', 'docs', 'documentation', 'donate',
    'donation', 'donations', 'email', 'emv', 'emvco', 'error', 'errors', 'eula',
    'false', 'faq', 'favicon', 'features', 'fonts', 'forgot', 'fraud', 'fund',
    'funding', 'funds', 'gdpr', 'hello', 'help', 'helpdesk', 'home', 'hostmaster',
    'how', 'how-it-works', 'hsbc', 'icons', 'images', 'img', 'impersonation', 'index',
    'info', 'internal', 'invite', 'invites', 'invoice', 'invoices', 'islami', 'janata',
    'jobs', 'js', 'legal', 'license', 'login', 'logout', 'mail', 'maintenance',
    'manifest', 'marketing', 'mastercard', 'mcash', 'media', 'mfa', 'moderation', 'moderator',
    'moderators', 'mycash', 'nagad', 'new', 'nil', 'no-reply', 'none', 'noreply',
    'npsb', 'null', 'oauth', 'official', 'okwallet', 'order', 'orders', 'otp',
    'partner', 'partners', 'password', 'pathaopay', 'pay', 'pay-now', 'paylink', 'payment',
    'payment-link', 'payments', 'paynow', 'payoneer', 'paypal', 'policy', 'postmaster', 'press',
    'pricing', 'privacy', 'private', 'prod', 'production', 'profile', 'qr', 'qr-code',
    'qrcode', 'receipt', 'receipts', 'redirect', 'referral', 'referrals', 'register', 'report',
    'reset', 'return', 'robots', 'rocket', 'root', 'rupali', 'sales', 'scam',
    'scan', 'secret', 'secure', 'security', 'service-worker', 'settings', 'sign-out', 'signin',
    'signout', 'signup', 'sitemap', 'sonali', 'sso', 'staff', 'staging', 'static',
    'status', 'stripe', 'subscription', 'support', 'surecash', 'system', 'taka-qr', 'takaqr',
    'tap', 'team', 'terms', 'test', 'testing', 'tests', 'tip', 'tips',
    'tos', 'true', 'trust', 'trust-safety', 'undefined', 'upay', 'uploads', 'vendor',
    'verification', 'verify', 'visa', 'wallet', 'wallets', 'webmaster', 'wise', 'www'
  ]);
$$;
