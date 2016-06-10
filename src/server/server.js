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

// Import quadtree.
var quadtree = require('simple-quadtree');

var tree = quadtree(0, 0, c.gameWidth, c.gameHeight);

var users = [];
var item = [];
var piece = [];
var bomb = [];
var dart = [];
var sockets = {};

var leaderboard = [];
var leaderboardChanged = false;

var V = SAT.Vector;
var C = SAT.Circle;

app.use(express.static(__dirname + '/../client'));

function addItem(toAdd) {
	var radius = 20;
	while (toAdd--) {
		var position = c.itemUniformDisposition ? util.uniformPosition(item, radius) : util.randomPosition(radius);
		var type = Math.floor(Math.random() * 2);
		item.push({
			id: ((new Date()).getTime() + '' + item.length) >>> 0,
			x: position.x,
			y: position.y,
			radius: radius,
			//item type: 0 for shield, 1 for dart
			type: type
		});
	}
}

function addPiece(toAdd) {
	var radius = 30;
	while (toAdd--) {
		var position = c.pieceUniformDisposition ? util.uniformPosition(piece, radius) : util.randomPosition(radius);
		var sides = util.pieceSide();
		piece.push({
			id: ((new Date()).getTime() + '' + piece.length) >>> 0,
			x: position.x,
			y: position.y,
			radius: radius,
			sides: sides,
			score: sides - 2,
			speed: c.piecespeed[sides - 3]
		});
	}
}

function movePlayer(player) {
	//handle the direction
	var deg = Math.atan2(player.target.y, player.target.x);
	var deltaY = player.speed * Math.sin(deg);
	var deltaX = player.speed * Math.cos(deg);
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
	var borderCalc = player.radius / 3;
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
	//random direction
	var dirX = Math.floor(Math.random() * 10) - 5;
	var dirY = Math.floor(Math.random() * 10) - 5;
	//handle the direction
	var deg = Math.atan2(dirY, dirX);
	var deltaY = p.speed * Math.sin(deg);
	var deltaX = p.speed * Math.cos(deg);
	//moving
	if (!isNaN(deltaY)) {
		p.y += deltaY;
	}
	if (!isNaN(deltaX)) {
		p.x += deltaX;
	}
	//handle the case around border
	var borderCalc = p.radius + 5;
	if (p.x > c.gameWidth - borderCalc) {
		p.x = c.gameWidth - borderCalc;
	}
	if (p.y > c.gameHeight - borderCalc) {
		p.y = c.gameHeight - borderCalc;
	}
	if (p.x < borderCalc) {
		p.x = borderCalc;
	}
	if (p.y < borderCalc) {
		p.y = borderCalc;
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
		item: [false, false],
		score: 0,
		level: 1,
		skillpoint: 0
	};
	function playerInit() {
		position = c.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);
		currentPlayer.x = position.x;
		currentPlayer.y = position.y;
		currentPlayer.speed = 5;
		currentPlayer.power = 200;
		currentPlayer.bombNum = 1;
		currentPlayer.item[0] = false;
		currentPlayer.item[1] = false;
		currentPlayer.score = 0;
		currentPlayer.level = 1;
		currentPlayer.skillpoint = 0;
	}
	//socket on event
	socket.on('respawn', function () {
		if (util.findIndex(users, currentPlayer.id) > -1)
			users.splice(util.findIndex(users, currentPlayer.id), 1);
		playerInit();
		socket.emit('welcome', currentPlayer);
		console.log('[INFO] User ' + currentPlayer.name + ' respawned!');
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
				explodedCount: 0
			});
			currentPlayer.bombNum -= 1;
			console.log('[INFO] User ' + currentPlayer.name + ' set a bomb!');
		}
	});
	socket.on('2', function(data) {
		//shoot dart
		if (currentPlayer.item[1]) {
			dart.push({
				x: currentPlayer.x,
				y: currentPlayer.y,
				target: {
					x: data.x,
					y: data.y
				},
				speed: 100
			});
			currentPlayer.item[1] = false;
		}
	});
	socket.on('3', function() {
		//go away
	});
	socket.on('4', function(data) {
		//skil up
		if ( currentPlayer.skillpoint > 0 ) {
			switch (data) {
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
	function eatItem(m) {
		if(SAT.pointInCircle(new V(m.x, m.y), playerCircle))
			return true;
		return false;
	}
	//start
	var playerCircle = new C(new V(currentPlayer.x, currentPlayer.y), currentPlayer.radius);
	//handle eating item
	var itemEaten = item.map(eatItem).reduce(function(a, b, c) {return b ? a.concat(c) : a; }, []);
	for(var m = 0; m < itemEaten.length; m++) {
		currentPlayer.item[item[itemEaten[m]].type] = true;
		item.splice(itemEaten[m],1);
		for(var n = 0; n < itemEaten.length; n++) {
			if(itemEaten[m] < itemEaten[n]) {
				itemEaten[n]--;
			}
		}
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
		scoreTotal += piece[piece_range[m]].score;
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
		if (users[user_range[m]].item[0]) {
			//user in range has shield
			users[user_range[m]].item[0] = false;
		} else {
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
			sockets[socketid].emit('RIP');
		}
	}
	//score for owner
	bombOwner = util.findIndex(users, currentBomb.owner);
	if (bombOwner > -1) {
		users[bombOwner].score += scoreTotal;
		users[bombOwner].bombNum += 1;
		while (users[bombOwner].score >= Math.pow(2, users[bombOwner].level)) {
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
						range: f.range,
						time: (f.time - (new Date()).getTime()) / 1000,
						exploded: f.exploded
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
							radius: f.radius
						};
					} else {
						return {
							x: f.x,
							y: f.y,
							radius: f.radius,
							speed: (f.speed / c.playerstatus.speedMax) * 100,
							power: (f.power / c.playerstatus.powerMax) * 100,
							bombNum: f.bombNum,
							item: f.item,
							score: f.score,
							level: f.level,
							skillpoint: f.skillpoint
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
