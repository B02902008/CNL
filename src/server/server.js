/*jslint bitwise: true, node: true */
'use strict';

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SAT = require('sat');

// Import game settings.
var c = require('../../config.json');

// Import utilities.
var util = require('./lib/util');
var dbconn = require('./lib/dbconn');

var users = [];
var item = [];
var piece = [];
var bomb = [];
var dart = [];
var sockets = {};

var leaderboard = [];
var leaderboardChanged = false;

var small_map = {gameWidth:c.gameWidth, gameHeight:c.gameHeight, you:{x:0, y:0}};

var V = SAT.Vector;
var C = SAT.Circle;

app.use(express.static(__dirname + '/../client'));

function addItem(toAdd) {
	var radius = 20;
	while (toAdd--) {
		var position = c.itemUniformDisposition ? util.uniformPosition(item, radius) : util.randomPosition(radius);
		var type = util.itemType();
		item.push({
			id: ((new Date()).getTime() + '' + item.length) >>> 0,
			x: position.x,
			y: position.y,
			radius: radius,
			//item type: 0 for shield, 1 for dart, 2 for direction opposite, 3 for slow down, 4 for transparent bomb
			type: type
		});
	}
}

function addPiece(toAdd) {
	var radius = 30;
	while (toAdd--) {
		var position = util.randomPosition(radius);
		var score = util.pieceScore();
		piece.push({
			id: ((new Date()).getTime() + '' + piece.length) >>> 0,
			x: position.x,
			y: position.y,
			radius: radius,
			targetDir: {x:0, y:0},
			dirChange: 0,
			score: score,
			speed: c.piecespeed[score - 1]
		});
	}
}

function movePlayer(player) {
	//handle the direction
	var deg = Math.atan2(player.target.y, player.target.x);
	var deltaY = player.speed * Math.sin(deg);
	var deltaX = player.speed * Math.cos(deg);
	//handle debuff
	if (player.opposite > 0) {
		deltaX = 0 - deltaX;
		deltaY = 0 - deltaY;
		player.opposite -= 1;
	}
	if (player.slowdown > 0) {
		deltaX *= 0.5;
		deltaY *= 0.5;
		player.slowdown -= 1;
	}
	if (player.protection > 0) {
		player.protection -= 1;
	}
	if (player.transparent > 0) {
		player.transparent -= 1;
	}
	//handle the speed (only mobile)
	var dist = Math.sqrt(Math.pow(player.target.y, 2) + Math.pow(player.target.x, 2));
	if (dist < (50 + player.radius)) {
		deltaY *= dist / (50 + player.radius);
		deltaX *= dist / (50 + player.radius);
	}
	//moving
	if (!isNaN(deltaY)) {
		player.y += deltaY;
	}
	if (!isNaN(deltaX)) {
		player.x += deltaX;
	}
	//handle the case around border
	var borderCalc = player.radius;
	if (player.x > c.gameWidth - borderCalc) {
		player.x = c.gameWidth - borderCalc;
	}
	if (player.y > c.gameHeight - borderCalc) {
		player.y = c.gameHeight - borderCalc;
	}
	if (player.x < borderCalc) {
		player.x = borderCalc;
	}
	if (player.y < borderCalc) {
		player.y = borderCalc;
	}
}

function movePiece(p) {
	//check if need to change direction
	if (p.dirChange === 0) {
		p.targetDir.x = Math.floor(Math.random() * 3) - 1;
		p.targetDir.y = Math.floor(Math.random() * 3) - 1;
		p.dirChange = 50;
	} else {
		p.dirChange -= 1;
	}
	//handle the direction
	var deg = Math.atan2(p.targetDir.y, p.targetDir.x);
	var deltaY = p.speed * Math.sin(deg) * Math.abs(p.targetDir.y);
	var deltaX = p.speed * Math.cos(deg) * Math.abs(p.targetDir.x);
	//moving
	if (!isNaN(deltaY)) {
		p.y += deltaY;
	}
	if (!isNaN(deltaX)) {
		p.x += deltaX;
	}
	//handle the case around border
	var borderCalc = p.radius + 30;
	if (p.x > c.gameWidth - borderCalc) {
		p.x = c.gameWidth - borderCalc;
		p.targetDir.x *= -1;
	}
	if (p.y > c.gameHeight - borderCalc) {
		p.y = c.gameHeight - borderCalc;
		p.targetDir.y *= -1;
	}
	if (p.x < borderCalc) {
		p.x = borderCalc;
		p.targetDir.x *= -1;
	}
	if (p.y < borderCalc) {
		p.y = borderCalc;
		p.targetDir.y *= -1;
	}
}

function moveDart(d) {
	function bombDist(m) {
		if (m.exploded)
			return false;
		if (Math.abs(a * m.x + b * m.y + c) > m.radius * Math.sqrt(Math.pow(a, 2) + Math.pow(b, 2)))
			return false;
		var distMax = Math.sqrt(Math.pow(deltaX, 2) + Math.pow(deltaY, 2) + Math.pow(m.radius, 2));
		var dist1 = Math.sqrt(Math.pow(m.x - x1, 2) + Math.pow(m.y - y1, 2));
		var dist2 = Math.sqrt(Math.pow(m.x - x2, 2) + Math.pow(m.y - y2, 2));
		if (dist1 < m.radius || dist2 < m.radius)
			return true;
		if (dist1 < distMax && dist2 < distMax)
			return true;
		return false;
	}
	//handle the direction
	var deg = Math.atan2(d.target.y, d.target.x);
	var deltaY = d.speed * Math.sin(deg);
	var deltaX = d.speed * Math.cos(deg);
	//moving
	if (!isNaN(deltaY)) {
		d.y += deltaY;
	}
	if (!isNaN(deltaX)) {
		d.x += deltaX;
	}
	//check if there's a bomb
	var x1 = d.x - deltaX, x2 = d.x, y1 = d.y - deltaY, y2 = d.y;
	var a = -deltaY, b = deltaX, c = x1*y2 - x2*y1;
	var bombExplode = bomb.map(bombDist).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	for (var m = 0; m < bombExplode.length; m++) {
		bomb[bombExplode[m]].time = 0;
	}
}

function balanceNum() {
	var itemToAdd = c.itemNum - item.length;
	var pieceToAdd = c.pieceNum - piece.length;

	if (itemToAdd > 0) {
		addItem(itemToAdd);
	}
	if (pieceToAdd > 0) {
		addPiece(pieceToAdd);
	}
}

io.on('connection', function (socket) {
	var type = socket.handshake.query.type;
	var radius = 40;
	var position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);
	var currentPlayer = {
		id: socket.id,
		name: "Unknown",
		x: position.x,
		y: position.y,
		radius: radius,
		lastpoke: new Date().getTime(),
		target: {
			x: 0,
			y: 0
		},
		speed: 5,
		power: 200,
		bombNum: 1,
		shield: 0,
		dart: 0,
		score: 0,
		level: 1,
		skillpoint: 0,
		avatar: 1,
		protection: 0,
		slowdown: 0,
		opposite: 0,
		transparent: 0
	};
	function playerInit() {
		position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);
		currentPlayer.x = position.x;
		currentPlayer.y = position.y;
		currentPlayer.speed = 5;
		currentPlayer.power = 200;
		currentPlayer.bombNum = 1;
		currentPlayer.shield = 0;
		currentPlayer.dart = 0;
		currentPlayer.score = 0;
		currentPlayer.level = 1;
		currentPlayer.skillpoint = 0;
		currentPlayer.avatar = 1;
		currentPlayer.protection = 300;
		currentPlayer.slowdown = 0;
		currentPlayer.opposite = 0;
		currentPlayer.transparent = 0;
	}
	//socket on event
	socket.on('respawn', function (key) {
		if (util.findIndex(users, currentPlayer.id) > -1)
			users.splice(util.findIndex(users, currentPlayer.id), 1);
		playerInit();
		if (key.length === 0) {
			socket.emit('welcome', currentPlayer, true);
		} else {
			dbconn.getQuery(key, currentPlayer, socket);
		}
		console.log('[INFO] User ' + currentPlayer.id + ' respawned!');
	});
	socket.on('gotit', function (player) {
		console.log('[INFO] Player ' + player.name + ' connecting!');
		if (util.findIndex(users, player.id) > -1) {
			console.log('[INFO] Player ID is already connected, kicking.');
			socket.disconnect();
		} else {
			console.log('[INFO] Player ' + player.name + ' connected!');
			//add to socket / user array
			sockets[player.id] = socket;
			currentPlayer = player;
			currentPlayer.lastpoke = new Date().getTime();
			users.push(currentPlayer);
			socket.emit('gameSetup', {
				gameWidth: c.gameWidth,
				gameHeight: c.gameHeight
			});
			console.log('Total players: ' + users.length);
		}
	});
	socket.on('windowResized', function (data) {
		currentPlayer.screenWidth = data.screenWidth;
		currentPlayer.screenHeight = data.screenHeight;
	});
	socket.on('disconnect', function () {
		if (util.findIndex(users, currentPlayer.id) > -1)
			users.splice(util.findIndex(users, currentPlayer.id), 1);
		console.log('[INFO] User ' + currentPlayer.name + ' disconnected!');
	});
	//player operation
	socket.on('0', function(target) {
		//set moving target
		currentPlayer.lastpoke = new Date().getTime();
		if (target.x !== currentPlayer.x || target.y !== currentPlayer.y) {
			currentPlayer.target = target;
		}
	});
	socket.on('1', function() {
		//set bomb
		if (currentPlayer.bombNum > 0) {
			bomb.push({
				id: ((new Date()).getTime() + '' + bomb.length) >>> 0,
				x: currentPlayer.x,
				y: currentPlayer.y,
				radius: 36,
				owner: currentPlayer.id,
				range: currentPlayer.power,
				time: (new Date()).getTime() + 5000,
				exploded: false,
				explodedCount: 0,
				transparent: (currentPlayer.transparent > 0)
			});
			currentPlayer.bombNum -= 1;
		}
	});
	socket.on('2', function(data) {
		//shoot dart
		if (currentPlayer.dart > 0) {
			dart.push({
				x: currentPlayer.x,
				y: currentPlayer.y,
				target: {
					x: data.x,
					y: data.y
				},
				speed: 100
			});
			currentPlayer.dart -= 1;
		}
	});
	socket.on('3', function(key) {
		//add back bomb not explode
		for (var i = 0; i < bomb.length; i++) {
			if (bomb[i].owner === currentPlayer.id && !bomb[i].exploded)
				currentPlayer.bombNum += 1;
		}
		dbconn.getInsert(key, currentPlayer);
		users.splice(util.findIndex(users, currentPlayer.id), 1);
		socket.emit('RIP', 'Hope You to Come Back Soon!');
	});
	socket.on('4', function(op, data) {
		//skil up
		if ( currentPlayer.skillpoint > 0 ) {
			switch (op) {
				case 'bomb':
					currentPlayer.bombNum += 1;
					currentPlayer.skillpoint -= 1;
					break;
				case 'speed':
					if (currentPlayer.speed < c.playerstatus.speedMax) {
						currentPlayer.speed += 1;
						currentPlayer.skillpoint -= 1;
					}
					break;
				case 'power':
					if (currentPlayer.power < c.playerstatus.powerMax) {
						currentPlayer.power += 40;
						currentPlayer.skillpoint -= 1;
					}
					break;
				default:
					break;
			}
		}
	});
	socket.on('5', function(op) {
		//change user avatar
		var avatarMax = (currentPlayer.level > 14) ? 7 : Math.ceil(currentPlayer.level / 2);
		if (op) {
			if (currentPlayer.avatar === avatarMax)
				currentPlayer.avatar = 1;
			else
				currentPlayer.avatar += 1;
		} else {
			if (currentPlayer.avatar === 1)
				currentPlayer.avatar = avatarMax;
			else
				currentPlayer.avatar -= 1;
		}
	});
	socket.on('6', function() {
		//use shield
		if (currentPlayer.shield > 0) {
			currentPlayer.protection = 300;
			currentPlayer.shield -= 1;
		}
	});
});

function tickPlayer(currentPlayer) {
	//kick if too long no poke
	if(currentPlayer.lastpoke < new Date().getTime() - c.maxInterval) {
		sockets[currentPlayer.id].emit('kick', 'Last poking received over ' + c.maxInterval / 1000 + ' seconds ago.');
		sockets[currentPlayer.id].disconnect();
	}
	//moving
	movePlayer(currentPlayer);
	//define functions
	function eatObject(m) {
		if(SAT.pointInCircle(new V(m.x, m.y), playerCircle))
			return true;
		return false;
	}
	//start
	var playerCircle = new C(new V(currentPlayer.x, currentPlayer.y), currentPlayer.radius);
	//handle eating item
	var m, n;
	var itemEaten = item.map(eatObject).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	for(m = 0; m < itemEaten.length; m++) {
		switch (item[itemEaten[m]].type) {
			case 0:
				if (currentPlayer.shield < c.playerstatus.shieldMax)
					currentPlayer.shield += 1;
				break;
			case 1:
				if (currentPlayer.dart < c.playerstatus.dartMax)
					currentPlayer.dart += 1;
				break;
			case 2:
				if (currentPlayer.protection === 0)
					currentPlayer.opposite = 300;
				break;
			case 3:
				if (currentPlayer.protection === 0)
					currentPlayer.slowdown = 300;
				break;
			case 4:
				currentPlayer.transparent = 600;
				break;
		}
		item.splice(itemEaten[m],1);
		for(n = 0; n < itemEaten.length; n++) {
			if(itemEaten[m] < itemEaten[n]) {
				itemEaten[n]--;
			}
		}
	}
	//handle eating piece
	var pieceEaten = piece.map(eatObject).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	if (pieceEaten.length > 0) {
		if ((currentPlayer.protection === 0) && (currentPlayer.shield > 0)) {
			currentPlayer.shield -= 1;
			currentPlayer.protection = 300;
		} else if ((currentPlayer.protection === 0) && (currentPlayer.shield === 0)) {
			users.splice(util.findIndex(users, currentPlayer.id), 1);
			sockets[currentPlayer.id].emit('RIP', 'You crashed into a mushroom!');
		}
	}
	for(m = 0; m < pieceEaten.length; m++) {
		currentPlayer.score += piece[pieceEaten[m]].score;
		piece.splice(pieceEaten[m],1);
		for(n = 0; n < pieceEaten.length; n++) {
			if(pieceEaten[m] < pieceEaten[n]) {
				pieceEaten[n]--;
			}
		}
	}
	while (currentPlayer.score >= Math.pow(1.1, currentPlayer.level)) {
		currentPlayer.level ++;
		currentPlayer.skillpoint ++;
	}
}

function EXPLOSION(currentBomb) {
	function inRange(m) {
		if(SAT.pointInCircle(new V(m.x, m.y), new C(new V(currentBomb.x, currentBomb.y), currentBomb.radius)))
			return true;
		return false;
	}
	//start
	var scoreTotal = 0, bombOwner = -1, levelDiff, socketid = -1;
	var m, n;
	//clean item in range
	var item_range = item.map(inRange).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	for(m = 0; m < item_range.length; m++) {
		item.splice(item_range[m],1);
		for(n = 0; n < item_range.length; n++) {
			if(item_range[m] < item_range[n]) {
				item_range[n]--;
			}
		}
	}
	//clean piece in range
	var piece_range = piece.map(inRange).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	for(m = 0; m < piece_range.length; m++) {
		scoreTotal += piece[piece_range[m]].score * 10;
		piece.splice(piece_range[m],1);
		for(n = 0; n < piece_range.length; n++) {
			if(piece_range[m] < piece_range[n]) {
				piece_range[n]--;
			}
		}
	}
	//clean user in range
	var user_range = users.map(inRange).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	for(m = 0; m < user_range.length; m++) {
		if ((users[user_range[m]].shield > 0) && (users[user_range[m]].protection === 0)) {
			//user in range has shield
			users[user_range[m]].shield -= 1;
			users[user_range[m]].protection = 300;
		} else if (users[user_range[m]].protection === 0) {
			//user in range died
			console.log("[INFO] User " + users[user_range[m]].name + " was exploded");
			//if bomb owner is still alive
			bombOwner = util.findIndex(users, currentBomb.owner);
			if (bombOwner > -1) {
				levelDiff = (users[bombOwner].level > users[user_range[m]].level) ? (users[bombOwner].level / users[user_range[m]].level) : 1;
				scoreTotal += Math.floor(users[user_range[m]].score / levelDiff);
			}
			socketid = users[user_range[m]].id;
			users.splice(user_range[m], 1);
			for(n = 0; n < user_range.length; n++) {
				if(user_range[m] < user_range[n]) {
					user_range[n]--;
				}
			}
			sockets[socketid].emit('RIP', 'You are exploded!');
		}
	}
	//score for owner
	bombOwner = util.findIndex(users, currentBomb.owner);
	if (bombOwner > -1) {
		users[bombOwner].score += scoreTotal;
		users[bombOwner].bombNum += 1;
		while (users[bombOwner].score >= Math.pow(1.1, users[bombOwner].level)) {
			users[bombOwner].level ++;
			users[bombOwner].skillpoint ++;
		}
	}
	//explode bomb in range
	var bomb_range = bomb.map(inRange).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	for(m = 0; m < bomb_range.length; m++)
		bomb[bomb_range[m]].time = 0;
}

function checkExplosion(currentBomb) {
	if ((currentBomb.time - (new Date()).getTime()) <= 0 && !currentBomb.exploded) {
		currentBomb.exploded = true;
		currentBomb.radius = currentBomb.range;
		EXPLOSION(currentBomb);
	}
}

function moveloop() {
	for (var i = 0; i < users.length; i++) {
		tickPlayer(users[i]);
	}
	for (i = 0; i < piece.length; i++) {
		movePiece(piece[i]);
	}
	for (i = 0; i < dart.length; i++) {
		moveDart(dart[i]);
		if (dart[i].x >= c.gameWidth || dart[i].x <= 0 || dart[i].y >= c.gameHeight || dart[i].y <= 0) {
			dart.splice(i, 1);
			i --;
		}
	}
	for (i = 0; i < bomb.length; i++) {
		if (bomb[i].exploded) {
			bomb[i].explodedCount += 1;
			if (bomb[i].explodedCount > 5) {
				bomb.splice(i, 1);
				i --;
			}
		}
	}
	bomb.forEach(checkExplosion);
}

function gameloop() {
	//supplement item and piece
	balanceNum();
	//renew the leaderboard
	if (users.length > 0) {
		var topUsers = [];
		//sort users by their score
		users.sort( function(a, b) { return b.score - a.score; });
		for (var i = 0; i < Math.min(10, users.length); i++) {
			topUsers.push({
				id: users[i].id,
				name: users[i].name,
				score: users[i].score
			});
		}
		if (isNaN(leaderboard) || leaderboard.length !== topUsers.length) {
			leaderboard = topUsers;
			leaderboardChanged = true;
		} else {
			for (i = 0; i < leaderboard.length; i++) {
				if (leaderboard[i].id !== topUsers[i].id) {
					leaderboard = topUsers;
					leaderboardChanged = true;
					break;
				}
			}
		}
	}
}

function sendUpdates() {
	//renew the small map
	small_map.user_list = users
		.map(function(f) {
			return {
				x: f.x,
				y: f.y
			};
		});
	small_map.piece_list = piece
		.map(function(f) {
			return {
				x: f.x,
				y: f.y
			};
		});
	small_map.bomb_list = bomb
		.map(function(f) {
			return {
				x: f.x,
				y: f.y,
				range: f.range
			};
		});
	users.forEach( function(u) {
		u.x = u.x || c.gameWidth / 2;
		u.y = u.y || c.gameHeight / 2;
		//visible item
		var visibleItem  = item
			.map(function(f) {
				if ( f.x + f.radius > u.x - u.screenWidth/2 - 20 &&
					f.x - f.radius < u.x + u.screenWidth/2 + 20 &&
					f.y + f.radius > u.y - u.screenHeight/2 - 20 &&
					f.y - f.radius < u.y + u.screenHeight/2 + 20) {
					return f;
				}
			})
			.filter(function(f) { return f; });
		//visible piece
		var visiblePiece  = piece
			.map(function(f) {
				if ( f.x + f.radius > u.x - u.screenWidth/2 - 20 &&
					f.x - f.radius < u.x + u.screenWidth/2 + 20 &&
					f.y + f.radius > u.y - u.screenHeight/2 - 20 &&
					f.y - f.radius < u.y + u.screenHeight/2 + 20) {
					return f;
				}
			})
			.filter(function(f) { return f; });
		//visible dart
		var visibleDart  = dart
			.map(function(f) {
				if ( f.x > u.x - u.screenWidth/2 - 20 &&
					f.x < u.x + u.screenWidth/2 + 20 &&
					f.y > u.y - u.screenHeight/2 - 20 &&
					f.y < u.y + u.screenHeight/2 + 20) {
					return f;
				}
			})
			.filter(function(f) { return f; });
		//visible bomb
		var visibleBomb = bomb
			.map(function(f) {
				if ( f.x + f.radius > u.x - u.screenWidth/2 - 20 &&
					f.x - f.radius < u.x + u.screenWidth/2 + 20 &&
					f.y + f.radius > u.y - u.screenHeight/2 - 20 &&
					f.y - f.radius < u.y + u.screenHeight/2 + 20) {
					return {
						id: f.id,
						x: f.x,
						y: f.y,
						owner: f.owner,
						range: f.range,
						time: (f.time - (new Date()).getTime()) / 1000,
						exploded: f.exploded,
						transparent: f.transparent
					};
				}
			})
			.filter(function(f) { return f; });
		//visible users
		var visibleUsers  = users
			.map(function(f) {
				if ( f.x + f.radius > u.x - u.screenWidth/2 - 20 &&
					f.x - f.radius < u.x + u.screenWidth/2 + 20 &&
					f.y + f.radius > u.y - u.screenHeight/2 - 20 &&
					f.y - f.radius < u.y + u.screenHeight/2 + 20) {
					if(f.id !== u.id) {
						return {
							id: f.id,
							name: f.name,
							x: f.x,
							y: f.y,
							radius: f.radius,
							level: f.level,
							avatar: f.avatar,
							protection: (f.protection > 0),
							opposite: (f.opposite > 0)
						};
					} else {
						return {
							x: f.x,
							y: f.y,
							radius: f.radius,
							speed: (f.speed / c.playerstatus.speedMax) * 100,
							power: (f.power / c.playerstatus.powerMax) * 100,
							bombNum: f.bombNum,
							shield: f.shield,
							dart: f.dart,
							score: f.score,
							level: f.level,
							skillpoint: f.skillpoint,
							avatar: f.avatar,
							protection: (f.protection > 0),
							opposite: (f.opposite > 0)
						};
					}
				}
			})
			.filter(function(f) { return f; });
		//send to user
		sockets[u.id].emit('serverTellPlayerMove', visibleUsers, visibleItem, visiblePiece, visibleDart, visibleBomb);
		if (leaderboardChanged) {
			sockets[u.id].emit('leaderboard', leaderboard);
		}
		small_map.you.x = u.x;
		small_map.you.y = u.y;
		sockets[u.id].emit('small_map', small_map);
	});
	leaderboardChanged = false;
}

setInterval(moveloop, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / c.networkUpdateFactor);

// Don't touch, IP configurations.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || '127.0.0.1';
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || c.port;
if (process.env.OPENSHIFT_NODEJS_IP !== undefined) {
    http.listen( serverport, ipaddress, function() {
        console.log('[DEBUG] Listening on *:' + serverport);
    });
} else {
    http.listen( serverport, function() {
        console.log('[DEBUG] Listening on *:' + c.port);
    });
}
