# myPDF companion (optional)

The browser app does everything except Office to PDF. This small local service does that one job on your own machine: the file goes from your browser to a program on your laptop and back, never to the internet.

## Run it (simplest: LibreOffice on your machine)
Needs Node 22 and LibreOffice (`sudo apt-get install -y libreoffice-writer-nogui` on Debian or Ubuntu).

    node companion/gateway.mjs

The first run prints a pairing token once and stores it in `~/secrets/mypdf.env` (mode 600). In myPDF choose Convert Word to PDF, paste the token, and tap Connect.

## Run it with Gotenberg (Docker, about 1.5 GB of memory while converting)

    cd companion
    MYPDF_COMPANION_TOKEN=$(openssl rand -base64 24 | tr '+/' '-_' | tr -d '=') docker compose up

Use the same token value in myPDF. Stop with `docker compose down`.

## Safety
- Listens on 127.0.0.1 only; nothing else on your network can reach it.
- Every request needs the pairing token. Browsers may call it only from https://mypdf.gachichio.org and from localhost.
- Converts one file at a time, 100 MB maximum, two minutes maximum.

## Uninstall
Stop the process (or `docker compose down`) and delete `~/secrets/mypdf.env`.
