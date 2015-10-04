module.exports = {
    rethinkdb: {
        host: "localhost",
        port: 28015,
        authKey: "",
        db: "poverty"
    },
    scant: {
        url: "http://localhost:3100"
    },
    poverty: {
        authBypass: false,
        rootUrl: "http://poverty.localtunnel.me",
        port: 3000
    }
};