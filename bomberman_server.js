var ws = require("ws");

var server = new ws.Server({ port: 3000 });

var CLIENTS = [];
var ROOMS = [];

function randomString(length) {
    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}

function initNewPlayer(client, data) {
    var player_id =  CLIENTS.push(client) - 1;
    client.id = player_id;
    client.room = null;
    client.gameData = {
        position:{
            x: 0,
            y: 0,
            z: 0,
        },
        alive: true,
        killedBy: null,
        deaths: 0,
        kills: 0,
        score: 0,
    }
}

function sendPacketToRoomPlayers(room, pkt) {
    pkt = JSON.stringify(pkt);
    for(var i = 0; i < room.players.length; i++) {
        let player = room.players[i];
        player.send(pkt);
    }
}

function sendLobbyState(room) {
    var pkt = {
        "type": "lobby_state",
        code: room.code,
        players: [],
        leader: room.leader,
        round: room.round,
        max_rounds: room.maxRounds,
    };
    for(var i = 0; i < room.players.length; i++) {
        let player = room.players[i];
        pkt.players.push({username: player.username, id: player.id, room_index: player.room_index})
    }
    
    for(var i = 0; i < room.players.length; i++) {
        let player = room.players[i];
        pkt.your_id = player.id;
        pkt.your_room_index = player.room_index;
        pktJson = JSON.stringify(pkt);
        //console.log(player);
        player.send(pktJson);
    }
}

function createNewLobby(client, data) {
    var code = randomString(5);

    while(typeof ROOMS[code] !== 'undefined') {
        code = randomString(5);
    }

    var newRoom = {
        players: [
            client,
        ],
        crates: [],
        items: [],
        state: "lobby",
        code: code,
        leader: 0,
        playersReady: 0,
        alivePlayers: 0,
        round: 1,
        maxRounds: 2,
    };

    ROOMS[code] = newRoom;

    client.room = newRoom.code;
    client.room_index = 0;
    client.state = "in_lobby";

    sendLobbyState(newRoom);
}

function leftLobby(client) {
    console.log(client.room);
    if(typeof ROOMS[client.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    var room = ROOMS[client.room];
    if(room.state == "lobby") {
        room.players.splice(client.room_index, 1);
        sendLobbyState(room);
    }
}

function joinLobby(client, data) {
    var code = data.code;
    if(typeof ROOMS[code] === 'undefined') {
        //fail
        return;
    }

    client.room = code;
    client.state = "in_lobby";

    client.room_index = ROOMS[code].players.push(client) -1;
    
    sendLobbyState(ROOMS[code]);
}

function startLobby(client, room) {
    if(typeof ROOMS[client.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    var room = ROOMS[client.room];
    if(room.leader == client.room_index) {
        var pkt = {
            "type": "lobby_start",
            code: room.code,
            players: [],
            crates: [],
            items: [],
            leader: room.leader,
            round: 0,
            max_rounds: room.maxRounds,    
            playersReady: 0,
            alivePlayers: 0,
        };
        room.state = "loading"
        for(var i = 0; i < room.players.length; i++) {
            let player = room.players[i];
            player.state = "loading";
            pkt.players.push({username: player.username, id: player.id, room_index: player.room_index})
        }
        sendPacketToRoomPlayers(room, pkt);
    }
}

function restartRound(room) {
    room.state = "round_in_progress";
    room.alivePlayers = room.players.length;
    room.crates = [];
    room.items = [];
    for(var i = 0; i < room.players.length; i++) {
        let player = room.players[i];
        player.state = "playing";
        player.gameData.alive = true;
        player.gameData.position = { "x": 0, "y": 0, "z": 0 };
    }
    var pkt = {
        "type": "round_restart",
        round: room.round,
        max_rounds: room.maxRounds,
    };
    sendPacketToRoomPlayers(room, pkt);
}

function updatePlayersOfNewWalkState(client, data) {

    if(typeof ROOMS[client.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    
    var room = ROOMS[client.room];

    var pkt = {
        type: "walkState",
        "id": client.id,
        "position": client.gameData.position,
        "walkState": data.walkState,
    };

    //console.log(pkt)
    sendPacketToRoomPlayers(room, pkt);

}

function updatePlayersOfNewBomb(client, data) {

    var pkt = {
        "type": "plant_bomb",
        "id": client.id,
        "position": data.position,
    };

    if(typeof ROOMS[client.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    
    var room = ROOMS[client.room];

    sendPacketToRoomPlayers(room, pkt);
}

function updatePlayersOfDeath(dead_player, data) {

    if(typeof ROOMS[dead_player.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    
    var room = ROOMS[dead_player.room];

    var pkt = {
        "type": "player_killed",
        "id": dead_player.id,
        "position": data.position,
        "killed_by": data.killer_id
    };

    sendPacketToRoomPlayers(room, pkt);
}

function playerReady(client) {
    if(typeof ROOMS[client.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    
    var room = ROOMS[client.room];

    console.log(client.username);

    room.playersReady++

    if(room.playersReady == room.players.length) {
        restartRound(room);
    }
}

function handlePlayerKilled(client, data) {
    var dead_player = CLIENTS[data.player_id];

    if(typeof ROOMS[dead_player.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    
    var room = ROOMS[dead_player.room];

    if(dead_player.gameData.alive) {
        dead_player.gameData.position = data.position;
        dead_player.gameData.alive = false;
        dead_player.gameData.deaths++;
        dead_player.gameData.killedBy = data.killer_id
        if(data.killer_id != data.player_id) {
            var killer = CLIENTS[data.killer_id];
            killer.kills++;
        }
        room.alivePlayers--;
        
        if(room.alivePlayers <= 1) {
            handleRoundEnded(room);
        }

        updatePlayersOfDeath(dead_player, data);
    }
}

function handleRoundEnded(room) {
    room.round++;

    var pkt = {
        "type": "round_ended",
    };

    sendPacketToRoomPlayers(room, pkt);

    console.log(room.round, room.maxRounds);

    if(room.round <= room.maxRounds) {
        setTimeout(function() {
            restartRound(room)
        }, 3000);
    } else {
        //GAME ENDED
        var pkt = {
            "type": "game_ended",
            "code": room.code,
            "players": [],
        };
        
        for(var i = 0; i < room.players.length; i++) {
            let player = room.players[i];
            pkt.players.push({username: player.username, id: player.id, room_index: player.room_index, kills: player.gameData.kills, deaths: player.gameData.deaths })
        }

        console.log(pkt);
        
        sendPacketToRoomPlayers(room, pkt);
    }
}

function crate_exploded(client, data) {
    //console.log(data);
    if(typeof ROOMS[client.room] === 'undefined') {
        //fail
        console.log("room not found");
        return;
    }
    
    var room = ROOMS[client.room];

    var crate_position = data.position;

    var crate_broken = false;
    for(var i = 0; i < room.crates.length; i++) {
        var crate = room.crates[i];
        if(crate.position == crate_position) {
            console.log(crate)
            crate_broken = true;
            break;
        }
    }

    var item_id = rngItem();

    if (!crate_broken && item_id != -1) {
        room.crates.push(crate_position);
        var pkt = {
            "type": "spawn_item",
            "item_id": item_id,
            "position": crate_position
        };
        //console.log("sending_spawn_item")
        sendPacketToRoomPlayers(room, pkt);
        //spawn crate
    }

}

function rngItem() {
    var randomNumber = Math.floor(Math.random() * 100);
    console.log(randomNumber);
    if(randomNumber < 20) {
        return -1; //no Item
    }
    if(randomNumber < 46) {
        return 0; //no Item
    }
    if(randomNumber < 64) {
        return 1; //no Item
    }
    if(randomNumber < 84) {
        return 2; //no Item
    }
    return -1;
}

function handleNewPacket(client, data) {
    //console.log(data);
    switch(data.type) {
        case "login": {
            client.username = data.username.substring(0, 14);
            if(data.action == "create_lobby") {
                createNewLobby(client, data);
            } else if(data.action == "join_lobby") {
                joinLobby(client, data);
            }
            break;
        }
        case "lobby_start": {
            startLobby(client);
            break;
        }
        case "walkState":{
            if(typeof ROOMS[client.room] === 'undefined') {
                //fail
                console.log("room not found");
                return;
            }
            
            var room = ROOMS[client.room];
            if(room.state == "round_in_progress" && client.gameData.alive) {
                client.gameData.position = data.walkState.position;
                updatePlayersOfNewWalkState(client, data);
            }
            break;
            //console.log("newWalkState", data);
        }
        case "plant_bomb": {
            client.gameData.position = data.position;
            updatePlayersOfNewBomb(client, data);
            break;
        }
        case "killed": {
            handlePlayerKilled(client, data);
            break;
        }
        case "map_loaded": {
            playerReady(client);
            break;
        }
        case "crate_exploded": {
            crate_exploded(client, data);
            break;
        }
    }
}

server.on('connection', (ws,request) => {

    initNewPlayer(ws);

    ws.on('message', message => {
        let data = JSON.parse(message);
        if(data.hasOwnProperty("type")) {
            handleNewPacket(ws, data);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(code,reason);
        if(ws.room != null) {
            leftLobby(ws);
        }
        CLIENTS.splice(ws.id, 1);
    })
})
