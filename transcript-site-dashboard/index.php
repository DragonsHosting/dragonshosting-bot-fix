<?php
declare(strict_types=1);

ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_name('dragon_transcript_session');
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header('Cache-Control: private, no-store, max-age=0');
header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");

$documentRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? __DIR__), '/\\');
$configPath = getenv('TRANSCRIPT_DASHBOARD_CONFIG') ?: dirname($documentRoot) . DIRECTORY_SEPARATOR . 'transcript-dashboard-config.php';
$config = is_file($configPath) ? require $configPath : [];
if (!is_array($config)) $config = [];

function jsonResponse(int $status, array $data): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: private, no-store, max-age=0');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function html(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function redirectHome(): void
{
    header('Location: /', true, 303);
    exit;
}

function isLoggedIn(): bool
{
    return isset($_SESSION['user']['id']) && is_string($_SESSION['user']['id']);
}

function staffRoleIds(array $config): array
{
    $roles = $config['discord_staff_role_ids'] ?? [];
    if (is_string($roles)) $roles = explode(',', $roles);
    if (!is_array($roles)) return [];
    $valid = array_filter(array_map(static fn($role): string => trim((string) $role), $roles),
        static fn(string $role): bool => preg_match('/^\d{17,20}$/', $role) === 1);
    return array_values(array_unique($valid));
}

function oauthIsConfigured(array $config): bool
{
    $redirect = (string) ($config['discord_redirect_uri'] ?? '');
    return !empty($config['discord_client_id'])
        && !empty($config['discord_client_secret'])
        && filter_var($redirect, FILTER_VALIDATE_URL)
        && str_starts_with(strtolower($redirect), 'https://')
        && preg_match('/^\d{17,20}$/', (string) ($config['discord_guild_id'] ?? '')) === 1
        && count(staffRoleIds($config)) > 0;
}

function discordRequest(string $url, ?string $body = null, array $headers = []): array
{
    if (!function_exists('curl_init')) throw new RuntimeException('PHP cURL is required.');
    $curl = curl_init($url);
    if ($curl === false) throw new RuntimeException('Could not start the Discord request.');
    $options = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($body !== null) {
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = $body;
    }
    curl_setopt_array($curl, $options);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $failed = $response === false;
    curl_close($curl);
    if ($failed || !is_string($response)) throw new RuntimeException('Discord could not be reached.');
    $data = json_decode($response, true);
    return [$status, is_array($data) ? $data : []];
}

function showLogin(array $config, string $message = ''): void
{
    $ready = oauthIsConfigured($config);
    $title = $ready ? 'Transcriptarchief' : 'Instellen vereist';
    $notice = $message ?: ($ready
        ? 'Log in met je Discord-account. Alleen ingestelde staffrollen krijgen toegang.'
        : 'Discord OAuth en minstens één staffrol moeten eerst worden ingesteld.');
    ?><!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title><?= html($title) ?> | DragonsHosting</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#0a0e14;color:#e7edf6}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 12% -10%,#1b3553 0,transparent 40%),#0a0e14}.card{width:min(440px,calc(100% - 32px));padding:32px;border:1px solid #26374a;border-radius:18px;background:#101722;box-shadow:0 20px 60px #0006;text-align:center}.mark{width:52px;height:52px;margin:0 auto 18px;display:grid;place-items:center;border:1px solid #3f83bb;border-radius:15px;background:linear-gradient(145deg,#164a72,#102238);color:#bde8ff;font-weight:900;font-size:23px}h1{margin:0;font-size:25px}.message{margin:12px 0 24px;color:#9dafc2;line-height:1.55}.login{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:12px 17px;border:1px solid #536be8;border-radius:10px;background:#5865f2;color:white;text-decoration:none;font-weight:700}.login:hover{background:#4752c4}.hint{margin-top:22px;color:#71849a;font-size:12px}.notice{padding:12px;border:1px solid #674d25;border-radius:10px;background:#2b2113;color:#e8c98d}
</style></head><body><main class="card"><div class="mark" aria-hidden="true">D</div><h1><?= html($title) ?></h1><p class="message<?= $ready ? '' : ' notice' ?>"><?= html($notice) ?></p><?php if ($ready): ?><a class="login" href="/?action=login" rel="nofollow">Inloggen met Discord</a><?php endif; ?><p class="hint">Privé transcriptarchief · DragonsHosting</p></main></body></html><?php
    exit;
}

$action = (string) ($_GET['action'] ?? '');

if ($action === 'login') {
    if (!oauthIsConfigured($config)) showLogin($config);
    $_SESSION['oauth_state'] = bin2hex(random_bytes(32));
    $_SESSION['oauth_state_created_at'] = time();
    $query = http_build_query([
        'client_id' => (string) $config['discord_client_id'],
        'redirect_uri' => (string) $config['discord_redirect_uri'],
        'response_type' => 'code',
        'scope' => 'identify guilds.members.read',
        'state' => $_SESSION['oauth_state'],
    ], '', '&', PHP_QUERY_RFC3986);
    header('Location: https://discord.com/oauth2/authorize?' . $query, true, 302);
    exit;
}

if (isset($_GET['code']) || isset($_GET['error'])) {
    $state = (string) ($_GET['state'] ?? '');
    $expectedState = (string) ($_SESSION['oauth_state'] ?? '');
    $stateCreatedAt = (int) ($_SESSION['oauth_state_created_at'] ?? 0);
    unset($_SESSION['oauth_state'], $_SESSION['oauth_state_created_at']);
    if ($expectedState === '' || $state === '' || time() - $stateCreatedAt > 600 || !hash_equals($expectedState, $state)) {
        $_SESSION['flash'] = 'De Discord-inlogpoging is verlopen. Probeer opnieuw.';
        redirectHome();
    }
    if (isset($_GET['error']) || !oauthIsConfigured($config)) {
        $_SESSION['flash'] = 'Discord-login is geweigerd of niet volledig ingesteld.';
        redirectHome();
    }

    try {
        $tokenBody = http_build_query([
            'client_id' => (string) $config['discord_client_id'],
            'client_secret' => (string) $config['discord_client_secret'],
            'grant_type' => 'authorization_code',
            'code' => (string) $_GET['code'],
            'redirect_uri' => (string) $config['discord_redirect_uri'],
        ], '', '&', PHP_QUERY_RFC3986);
        [$tokenStatus, $token] = discordRequest('https://discord.com/api/v10/oauth2/token', $tokenBody, ['Content-Type: application/x-www-form-urlencoded']);
        if ($tokenStatus !== 200 || empty($token['access_token'])) throw new RuntimeException('OAuth token exchange failed.');

        $authorization = 'Authorization: Bearer ' . (string) $token['access_token'];
        [$userStatus, $user] = discordRequest('https://discord.com/api/v10/users/@me', null, [$authorization]);
        if ($userStatus !== 200 || empty($user['id'])) throw new RuntimeException('Discord user lookup failed.');

        $guildId = rawurlencode((string) $config['discord_guild_id']);
        [$memberStatus, $member] = discordRequest('https://discord.com/api/v10/users/@me/guilds/' . $guildId . '/member', null, [$authorization]);
        if ($memberStatus !== 200 || !is_array($member['roles'] ?? null)) {
            $_SESSION['flash'] = 'Je Discord-account is geen lid van de ingestelde server.';
            redirectHome();
        }

        $allowedRoles = staffRoleIds($config);
        if (count(array_intersect($allowedRoles, array_map('strval', $member['roles']))) === 0) {
            $_SESSION['flash'] = 'Je Discord-account heeft geen staffrol die toegang geeft.';
            redirectHome();
        }

        session_regenerate_id(true);
        $_SESSION['user'] = [
            'id' => (string) $user['id'],
            'username' => (string) ($user['global_name'] ?? $user['username'] ?? 'Discord-gebruiker'),
            'logged_in_at' => time(),
        ];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        redirectHome();
    } catch (Throwable $error) {
        error_log('[Transcript Dashboard] Discord authentication failed.');
        $_SESSION['flash'] = 'Discord-login lukte niet. Probeer het opnieuw.';
        redirectHome();
    }
}

if ($action === 'logout') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST'
        || !hash_equals((string) ($_SESSION['csrf_token'] ?? ''), (string) ($_POST['csrf_token'] ?? ''))) {
        http_response_code(403);
        exit('Ongeldige aanvraag.');
    }
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $cookie = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 3600,
            'path' => $cookie['path'],
            'secure' => $cookie['secure'],
            'httponly' => $cookie['httponly'],
            'samesite' => $cookie['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
    redirectHome();
}

if ($action === 'list') {
    if (!isLoggedIn()) jsonResponse(401, ['error' => 'Meld aan met Discord om transcripts te bekijken.']);
    $dataDirectory = realpath((string) ($config['data_directory'] ?? $documentRoot));
    $listPath = $dataDirectory ? $dataDirectory . DIRECTORY_SEPARATOR . 'transcripts.json' : '';
    if ($listPath === '' || !is_file($listPath) || (filesize($listPath) ?: 0) > 20_000_000) {
        jsonResponse(503, ['error' => 'Het transcriptarchief is niet beschikbaar.']);
    }
    $archive = json_decode((string) file_get_contents($listPath), true);
    $items = is_array($archive['items'] ?? null) ? $archive['items'] : [];
    $safeItems = [];
    foreach (array_slice($items, 0, 2000) as $item) {
        if (!is_array($item) || preg_match('/^[a-z0-9][a-z0-9-]{4,95}$/i', (string) ($item['id'] ?? '')) !== 1) continue;
        $safeItems[] = [
            'id' => (string) $item['id'],
            'closedAt' => (string) ($item['closedAt'] ?? ''),
            'channelName' => (string) ($item['channelName'] ?? ''),
            'type' => (string) ($item['type'] ?? ''),
            'username' => (string) ($item['username'] ?? ''),
            'closedBy' => (string) ($item['closedBy'] ?? ''),
            'messageCount' => is_numeric($item['messageCount'] ?? null) ? (int) $item['messageCount'] : null,
        ];
    }
    usort($safeItems, static fn(array $a, array $b): int => strcmp($b['closedAt'], $a['closedAt']));
    jsonResponse(200, ['items' => $safeItems, 'updatedAt' => (string) ($archive['updatedAt'] ?? '')]);
}

if (isset($_GET['transcript'])) {
    if (!isLoggedIn()) {
        http_response_code(401);
        exit('Meld aan met Discord om dit transcript te bekijken.');
    }
    $id = (string) $_GET['transcript'];
    if (preg_match('/^[a-z0-9][a-z0-9-]{4,95}$/i', $id) !== 1) {
        http_response_code(400);
        exit('Ongeldig transcript-ID.');
    }
    $dataDirectory = realpath((string) ($config['data_directory'] ?? $documentRoot));
    $transcriptRoot = $dataDirectory ? realpath($dataDirectory . DIRECTORY_SEPARATOR . 't') : false;
    $transcriptPath = $transcriptRoot ? realpath($transcriptRoot . DIRECTORY_SEPARATOR . $id . DIRECTORY_SEPARATOR . 'index.html') : false;
    if (!$transcriptRoot || !$transcriptPath || !str_starts_with($transcriptPath, $transcriptRoot . DIRECTORY_SEPARATOR) || !is_file($transcriptPath)) {
        http_response_code(404);
        exit('Transcript niet gevonden.');
    }
    header('Content-Type: text/html; charset=utf-8');
    header("Content-Security-Policy: sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https:; font-src data: https:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    readfile($transcriptPath);
    exit;
}

$flash = (string) ($_SESSION['flash'] ?? '');
unset($_SESSION['flash']);
if (!isLoggedIn()) showLogin($config, $flash);
$userName = (string) ($_SESSION['user']['username'] ?? 'Discord-gebruiker');
$csrfToken = (string) ($_SESSION['csrf_token'] ?? '');
?><!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Tickettranscripts | DragonsHosting</title>
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a0e14;color:#e7edf6}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 12% -10%,#1b3553 0,transparent 40%),#0a0e14}main{width:min(1120px,calc(100% - 32px));margin:0 auto;padding:42px 0 64px}header{display:flex;align-items:center;gap:16px;margin-bottom:30px}.mark{width:48px;height:48px;display:grid;place-items:center;border:1px solid #3f83bb;border-radius:14px;background:linear-gradient(145deg,#164a72,#102238);color:#bde8ff;font-weight:900;font-size:21px;box-shadow:0 8px 28px #0006}h1{margin:0;font-size:clamp(23px,4vw,32px);letter-spacing:-.035em}.subtitle{color:#91a3b8;margin:5px 0 0;font-size:14px}.userbar{margin-left:auto;display:flex;align-items:center;gap:12px;color:#9dafc2;font-size:13px}.panel{border:1px solid #202d3d;border-radius:16px;background:#101722ef;box-shadow:0 20px 60px #0004;overflow:hidden}.toolbar{display:flex;gap:12px;align-items:center;padding:18px;border-bottom:1px solid #202d3d}input{flex:1;min-width:120px;color:#edf4fb;background:#0b111a;border:1px solid #2b394a;border-radius:10px;outline:none;padding:12px 14px;font:inherit}input:focus{border-color:#54a5dc;box-shadow:0 0 0 3px #2385bf2a}button{border:1px solid #3276a7;border-radius:10px;padding:11px 15px;background:#123553;color:#dff4ff;font:inherit;font-weight:650;cursor:pointer}button:hover{background:#194a70}.logout{border-color:#33465b;background:#142234;color:#c5d4e4}.status{display:flex;justify-content:space-between;gap:12px;padding:13px 18px;color:#91a3b8;font-size:13px}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:760px}th,td{padding:14px 16px;text-align:left;border-top:1px solid #1e2937}th{color:#8297ac;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;background:#0d141e}td{font-size:13px;color:#dbe5ef}td small{display:block;margin-top:4px;color:#8193a7;font-size:12px}.tag{display:inline-block;border:1px solid #33465b;border-radius:999px;padding:4px 9px;color:#b9d9ef;background:#142234;white-space:nowrap}.open{display:inline-block;color:#79c8ff;font-weight:700;text-decoration:none;white-space:nowrap}.open:hover{color:#b6e3ff;text-decoration:underline}.empty{padding:42px 18px;color:#91a3b8;text-align:center}footer{padding-top:17px;color:#64778c;text-align:center;font-size:12px}@media(max-width:600px){main{width:min(100% - 20px,1120px);padding-top:24px}header{margin-bottom:20px;flex-wrap:wrap}.toolbar{padding:12px}.status{padding:12px}.userbar{width:100%;margin-left:64px}}
</style></head><body><main>
<header><div class="mark" aria-hidden="true">D</div><div><h1>Tickettranscripts</h1><p class="subtitle">DragonsHosting · bewaar en doorzoek gesloten tickets</p></div><div class="userbar"><span><?= html($userName) ?></span><form method="post" action="/?action=logout"><input type="hidden" name="csrf_token" value="<?= html($csrfToken) ?>"><button class="logout" type="submit">Uitloggen</button></form></div></header>
<section class="panel" aria-label="Transcriptarchief"><div class="toolbar"><input id="search" type="search" placeholder="Zoek op ticket, type, naam of medewerker…" autocomplete="off" aria-label="Zoek transcripts"><button id="refresh" type="button">Vernieuwen</button></div><div class="status"><span id="count">Laden…</span><span id="updated"></span></div><div class="table-wrap"><table><thead><tr><th>Gesloten</th><th>Ticket</th><th>Type</th><th>Aangemaakt door</th><th>Gesloten door</th><th>Berichten</th><th></th></tr></thead><tbody id="rows"></tbody></table><div id="empty" class="empty" hidden>Geen transcripts gevonden.</div></div></section><footer>Privé dashboard · Discord-stafflogin</footer></main>
<script>
const rows=document.querySelector('#rows'),search=document.querySelector('#search'),count=document.querySelector('#count'),empty=document.querySelector('#empty');let items=[];
function formatDate(value){const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('nl-NL',{dateStyle:'medium',timeStyle:'short'}).format(date):'Onbekend'}
function cell(row,value){const td=document.createElement('td');td.textContent=String(value??'');row.append(td);return td}
function render(){const q=search.value.trim().toLocaleLowerCase('nl-NL');const visible=items.filter(item=>!q||[item.id,item.channelName,item.type,item.username,item.closedBy].some(value=>String(value||'').toLocaleLowerCase('nl-NL').includes(q)));count.textContent=`${visible.length} van ${items.length} transcript${items.length===1?'':'s'}`;empty.hidden=visible.length>0;rows.replaceChildren();for(const item of visible){const tr=document.createElement('tr');cell(tr,formatDate(item.closedAt));const channel=cell(tr,'');const strong=document.createElement('strong');strong.textContent=item.channelName||'Ticket';const small=document.createElement('small');small.textContent=item.id;channel.append(strong,small);const type=cell(tr,'');const tag=document.createElement('span');tag.className='tag';tag.textContent=item.type||'Support';type.append(tag);cell(tr,item.username||'Onbekend');cell(tr,item.closedBy||'Onbekend');cell(tr,item.messageCount??'—');const action=cell(tr,'');const link=document.createElement('a');link.className='open';link.href='/?transcript='+encodeURIComponent(item.id);link.target='_blank';link.rel='noopener noreferrer';link.textContent='Openen ↗';action.append(link);rows.append(tr)}}
async function load(){count.textContent='Laden…';try{const response=await fetch('?action=list',{cache:'no-store',credentials:'same-origin',headers:{Accept:'application/json'}});if(response.status===401){location.reload();return}if(!response.ok)throw new Error('archive unavailable');const data=await response.json();items=Array.isArray(data.items)?data.items:[];render();document.querySelector('#updated').textContent=data.updatedAt?'Bijgewerkt '+formatDate(data.updatedAt):''}catch{count.textContent='Archief laden mislukt';rows.replaceChildren();empty.hidden=false;empty.textContent='Het transcriptarchief is tijdelijk niet bereikbaar. Probeer opnieuw te laden.'}}
search.addEventListener('input',render);document.querySelector('#refresh').addEventListener('click',load);load();
</script></body></html>
