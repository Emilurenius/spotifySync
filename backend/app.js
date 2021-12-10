//#region All external modules are loaded in:
const express = require("express")
const app = express()
const bodyParser = require("body-parser")
const path = require("path")
const fs = require("fs")
const cors = require("cors")
const cookieParser = require("cookie-parser")
const bcrypt = require("bcrypt")
const SpotifyWebAPI = require('spotify-web-api-node');
//#endregion All external modules are loaded in:

//#region spotifyData
const scopes = ['user-read-playback-state', 'user-modify-playback-state']
const clientData = loadJSON("/spotifyClientData.json")
let clients = {
    sessions: {},
    slaves: {}
}
//#endregion spotifyData

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
      if ((new Date().getTime() - start) > milliseconds){
        break;
      }
    }
  }

//#region JSON functions

function loadJSON(filename) {
    const rawdata = fs.readFileSync(path.join(__dirname, filename))
    const data = JSON.parse(rawdata)
    return data
}

function saveJSON(json, filename) {
    const stringified = JSON.stringify(json, null, 4)
    fs.writeFile(path.join(__dirname, filename), stringified, (err) => {
        if (err) throw err
        console.log("Data written to file")
    })
}

//#endregion JSON functions

//#region spotify functions

function getNewSlaveID(){
    const max = 9999999999
    const min = 1000000000
    let id = Math.floor(Math.random()*(max-min+1)+min)
    while (id.toString() in clients.slaves) {
        id = Math.floor(Math.random()*(max-min+1)+min)
    }
    return id
}

function getActivePlayerID(players) {
    for (let i = 0; i < players.length; i++) {
        console.log(players[i])
        if (players[i].is_active == true) {
            return players[i].id
        }
    }
}

const compareCurrentSongs = async (sessionClient, slaveClient) => {
    const sessionSong = await sessionClient.getMyCurrentPlayingTrack()
    const slaveSong = await slaveClient.getMyCurrentPlayingTrack()
    console.log(sessionSong.body.item.uri == slaveSong.body.item.uri)

    if (sessionSong.body.item.uri == slaveSong.body.item.uri) {
        console.log(sessionSong.body.item.uri)
        return false
    }
    else {
        return sessionSong.body.item.uri
    }
}

const compareSongProgress = async (sessionClient, slaveClient, slaveID) => {
    //const sessionProgress = parseInt(clients.sessions.songProgress) + (parseInt(Date.now()) - parseInt(clients.sessions.lastUpdated))
    const sessionSong = await sessionClient.getMyCurrentPlayingTrack()
    const slaveSong = await slaveClient.getMyCurrentPlayingTrack()

    if (clients.slaves[slaveID].userDelay != clients.slaves[slaveID].prevUserDelay || clients.slaves[slaveID].songChanged) {
        clients.slaves[slaveID].prevUserDelay = clients.slaves[slaveID].userDelay
        clients.slaves[slaveID].songChanged = false
        const sessionProgress = sessionSong.body.progress_ms
        const slaveProgress = slaveSong.body.progress_ms
        console.log(slaveID)
        const delay = clients.slaves[slaveID].defaultDelay + clients.slaves[slaveID].userDelay

        console.log(`Session: ${sessionProgress} Slave:${slaveProgress}`)

        if (sessionProgress + delay) {
            slaveClient.seek(sessionProgress + delay)
        }
    }
}

function refreshAccessToken(client) {

    console.log(client)

    client.refreshAccessToken().then(
        (data) => { 
            console.log("Access token refreshed")

            client.setAccessToken(data.body["access_token"])
        },
        (err) => {
            console.log("Could not refresh access token", err)
        }
    )
}

function createClient(clientData) {
    return new SpotifyWebAPI({
        clientId: clientData.clientID,
        clientSecret: clientData.clientSecret,
        redirectUri: clientData.loginRedirect
    })
}

const spotifyAPI = createClient(clientData)

//#endregion spotify functions

//#region Reading input from terminal
const port = parseInt(process.argv[2] || 3000)
console.log(`${port} registered as server port`)
//#endregion Reading input from terminal

//#region app setup
app.use(bodyParser.urlencoded({ extended: false })) // Set up body parser as middleware
app.use(bodyParser.json())
app.use(cookieParser()) // Middleware for handling cookies
app.use(cors()) // Making sure the browser can request more data after it is loaded on the client computer.
app.set("trust proxy", 1); // Enable cross origin cookies
//#endregion app setup

app.use(express.static(path.join(__dirname, 'index')))

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index', 'index.html'))
})

//#region spotify GET requests

app.get('/spotify/login', (req, res) => {
    const authorizeURL = spotifyAPI.createAuthorizeURL(scopes, null, true)
    res.redirect(`${authorizeURL}`)
})

app.get('/spotify/login/success', (req, res) => {
    const auth = req.query.code

    spotifyAPI.authorizationCodeGrant(auth)
    .then((data) => {
        console.log(data)
        res.cookie('access_token', data.body.access_token, { maxAge: 86400000, httpOnly: false })
        res.cookie('refresh_token', data.body.refresh_token, { maxAge: 86400000, httpOnly: false })
        res.redirect('/')
    }, (err) => {
        console.log('Something went wrong while retrieving acces token')
        res.send('Something went wrong while retrieving acces token')
    })
})

app.get('/spotify/getPlaying', (req, res) => {
    console.log(req.cookies)
    const client = createClient(clientData)
    client.setAccessToken(req.cookies.access_token)
    client.getMyCurrentPlayingTrack()
    .then ((data) => {
        console.log(data.body)
        res.send(data.body)
    }, (err) => {
        console.error(err)
    })
})

app.get('/spotify/sync/startSession', async (req, res) => {
    console.log('Session started')
    const client = createClient(clientData)
    client.setAccessToken(req.cookies.access_token)
    client.setRefreshToken(req.cookies.refresh_token)
    refreshAccessToken(client)
    clients.sessions[req.query.session] = {
        client: client,
        lastActive: Date.now(),
        songProgress: undefined,
        lastUpdated: undefined
    }
    res.sendStatus(200)
})

app.get('/spotify/sync/joinSession', async (req, res) => {
    console.log(`User joined session: ${req.query.session}`)
    const client = createClient(clientData)
    console.log(req.cookies.access_token)
    console.log(req.body.refresh_token)
    console.log(req.cookies.clientID)
    client.setAccessToken(req.cookies.access_token)
    client.setRefreshToken(req.cookies.refresh_token)
    refreshAccessToken(client)
    const slaveID = getNewSlaveID()
    clients.slaves[slaveID] = {
        client: client,
        lastActive: Date.now(),
        session: req.query.session,
        defaultDelay: -1000,
        userDelay: 0,
        prevUserDelay: 0,
        songChanged: false
    }
    res.cookie('slaveID', slaveID, { maxAge: 86400000, httpOnly: false })
    res.send(`${slaveID}`)
})

app.get('/spotify/sync/setDelay', async (req, res) => {
    console.log('Connected')
    const delay = req.query.delay
    clients.slaves[req.cookies.slaveID].prevUserDelay = clients.slaves[req.cookies.slaveID].userDelay
    clients.slaves[req.cookies.slaveID].userDelay = parseInt(delay)
    console.log(delay)

    res.send(delay)
})

//#endregion spotify GET requests

const interval = setInterval(() => {
    for (const [k, v] of Object.entries(clients.sessions)) {
        try {
            v.client.getMyCurrentPlayingTrack()
            .then((playingSong) => {
                const songProgress = playingSong.body.progress_ms
                v.lastActive = Date.now()
                v.lastUpdated = Date.now()
                v.songProgress = songProgress
                //console.log('\n--------------------------------------')
                //console.log(`Progress:${(songProgress / 1000)} Secs`)
                //console.log('--------------------------------------')
            })
        }
        catch (err) {
            if (err.message.includes('The access token expired')) {
                console.log('Access token expired')
                refreshAccessToken(v.client)
            }
            else {
                console.log(err)
                throw new Error(err)
            }
        }
    }

    for (const [k, v] of Object.entries(clients.slaves)) {
        console.log(`\n${k} asking for ${v.session}`)
        try {
            sessionClient = clients.sessions[v.session].client
            compareCurrentSongs(sessionClient, v.client)
            .then ((diffSong) => {
                if (diffSong) {
                    v.songChanged = true
                    v.client.addToQueue(diffSong)
                    .then ((data) => {
                        v.client.skipToNext()
                    })
                }
                else {
                    //console.log('Clients already in sync')
                }

            })
            compareSongProgress(sessionClient, v.client, k)
        }
        catch (err) {
            if (err.status == 401) {
                console.log('Access token expired')
                refreshAccessToken(v.client)
            }
            else {
                console.log(err)
                throw new Error(err)
            }
        }
    }
}, 5000)


app.listen(port, () => console.log(`Listening on ${port}`))