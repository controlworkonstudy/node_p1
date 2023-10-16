const fs = require('fs')
const http = require('http')
const path = require('path')
const url = require('url')
const { WebSocketServer } = require('ws')
const { ThrottleGroup } = require("stream-throttle")
const { RateLimiterMemory } = require('rate-limiter-flexible')
const config = require('config')
const bandwidth = config.get('server.bandwidth')
const threads = config.get('server.threads')
const duration = config.get('server.duration')
const port = process.env.PORT || 9090
const host = process.env.HOST || 'localhost'
const keywords = {
    'people': [`/?content=people/m.png`,
    `/?content=people/w.png`],
    'world': [`/?content=world/a.jpg`,
    `/?content=world/b.jpg`,
    `/?content=world/c.jpg`],
};
const mime = {
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
};
// 2 request per 10 seconds
const rateLimiter = new RateLimiterMemory({ points: threads, duration: duration })
// 60 КByte per 1 second
const tg = new ThrottleGroup({ rate: bandwidth })
const homeData = fs.readFileSync('./home.html', { encoding: 'utf8', flag: 'r' })

function content(req, res) {
    rateLimiter.consume(req.ip).then(() => {
        const query = url.parse(req.url, true).query
        let content = query.content || ''
        const p = path.resolve(__dirname, 'content', content)
        const cType = mime[path.extname(p).slice(1)] || 'text/plain'
        const rstream = fs.createReadStream(p)
        rstream.on('open', () => {
            const sStats = fs.statSync(p)
            res.setHeader('Content-Type', cType) // Без этого картинок нет
            res.setHeader('Content-Length', sStats.size) // Без этого прогресса нет
            res.setHeader('Threads', rateLimiter.points)
            rstream.pipe(tg.throttle()).pipe(res) // Limit bandwidth
        }).on('error', exp => {
            res.end('Content not exist')
        });
    }).catch((exp) => {
        res.end('Too many requests')
    });
}

const server = http.createServer((req, res) => {
    if (req.url == "/") {
        res.end(homeData)
    } else {
        content(req, res)
    }
});
const wss = new WebSocketServer({ server })
wss.on('connection', (ws) => {
    ws.on('message', (keyword) => {
        const urls = keywords[keyword] || []
        ws.send(JSON.stringify(urls))
    });
    ws.on('error', console.error);
});
server.listen(port, host)
