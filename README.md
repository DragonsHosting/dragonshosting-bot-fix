# DragonsHosting Bot

![Status](https://img.shields.io/badge/status-active-32cd32?style=for-the-badge)
![Runtime](https://img.shields.io/badge/runtime-node.js-339933?style=for-the-badge)
![Discord](https://img.shields.io/badge/platform-discord-5865f2?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

DragonsHosting Bot is a Discord management bot for hosting communities. It includes ticket flows, moderation tools, transcript handling, channel statistics, anti-alt checks, verification, and support panel utilities.

## Features

- Ticket panels and transcript storage
- Moderation commands and support workflows
- Security checks for scam links, token leaks, spam, and dangerous attachments
- Voice TTS worker support
- Channel statistics automation
- Verification and anti-alt modules

## Tech stack

- JavaScript / Node.js
- Discord.js
- HTML, CSS, and browser-side JavaScript for public transcript pages
- Optional MongoDB-backed transcript storage

## Configuration

Copy `.env.example` to `.env` and configure the required values:

```env
BOT_TOKEN=
CLIENT_ID=
GUILD_ID=
TRANSCRIPT_SECRET=
```

Never commit `.env` or production tokens.

## GitHub language bar

This repository contains source files and `.gitattributes` rules so GitHub Linguist can detect the code languages cleanly while ignoring generated images, archives, and runtime transcript output.
