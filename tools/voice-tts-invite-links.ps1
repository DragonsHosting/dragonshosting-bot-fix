$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"

if (-not (Test-Path -LiteralPath $envPath)) {
    throw ".env not found at $envPath"
}

function Get-EnvValue {
    param([Parameter(Mandatory = $true)][string] $Name)
    $line = Get-Content -LiteralPath $envPath | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return $line.Substring($Name.Length + 1).Trim()
}

function Decode-DiscordClientIdFromToken {
    param([Parameter(Mandatory = $true)][string] $Token)
    $firstPart = $Token.Split(".")[0]
    $padded = $firstPart.Replace("-", "+").Replace("_", "/")
    while (($padded.Length % 4) -ne 0) { $padded += "=" }
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded))
}

$mainClientId = Get-EnvValue "CLIENT_ID"
if ($mainClientId) {
    "Main bot invite:"
    "https://discord.com/oauth2/authorize?client_id=$mainClientId&scope=bot%20applications.commands&permissions=268561488"
    ""
}

for ($i = 1; $i -le 4; $i++) {
    $token = Get-EnvValue "VOICE_TTS_WORKER_TOKEN_$i"
    if (-not $token) {
        "TTS-$i invite: missing VOICE_TTS_WORKER_TOKEN_$i"
        continue
    }

    $clientId = Decode-DiscordClientIdFromToken $token
    "TTS-$i invite:"
    "https://discord.com/oauth2/authorize?client_id=$clientId&scope=bot&permissions=36701184"
    ""
}
