const express = require("express");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

const {
    default: makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const app = express();

app.use(express.json());

let sock;

const LOG_FILE = path.join(__dirname, "bot.log");

function log(message, error = null) {

    const timestamp = new Date().toLocaleString("pt-BR");

    let texto = `[${timestamp}] ${message}`;

    if (error) {
        texto += `\n${error.stack || error.message || error}`;
    }

    fs.appendFileSync(LOG_FILE, texto + "\n");
}

async function iniciarWhatsapp() {

    try {

        const { state, saveCreds } =
            await useMultiFileAuthState("./auth");

        const { version } =
            await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: "silent" })
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", (update) => {

            const { connection, qr, lastDisconnect } = update;

            if (qr) {
                qrcode.generate(qr, { small: true });
                log("QR Code gerado. Autenticação necessária.");
            }

            if (connection === "open") {
                log("WhatsApp conectado.");
            }

            if (connection === "close") {

                const shouldReconnect =
                    lastDisconnect?.error?.output?.statusCode !==
                    DisconnectReason.loggedOut;

                log(
                    shouldReconnect
                        ? "WhatsApp desconectado. Tentando reconectar em 5 segundos."
                        : "WhatsApp desconectado. Sessão encerrada."
                );

                if (shouldReconnect) {
                    setTimeout(() => {
                        iniciarWhatsapp();
                    }, 5000);
                }
            }
        });

    } catch (erro) {

        log("Erro ao iniciar WhatsApp.", erro);

        setTimeout(() => {
            iniciarWhatsapp();
        }, 5000);
    }
}

app.post("/send", async (req, res) => {

    try {

        const destino = req.body.number;

        await sock.sendMessage(destino, {
            text: req.body.message
        });

        res.send("ok");

    } catch (erro) {

        log("Erro ao enviar mensagem.", erro);

        res.status(500).json({
            status: "erro",
            message: erro.message
        });
    }
});

app.listen(3000, () => {
    log("API iniciada na porta 3000.");
});

iniciarWhatsapp();