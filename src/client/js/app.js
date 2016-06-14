var io = require('socket.io-client');
var Canvas = require('./canvas');
var global = require('./global');

var playerNameInput = document.getElementById('playerNameInput');
var socket;
var reason;

var playerConfig = {
	border: 6,
	textColor: '#FFFFFF',
	textBorder: '#000000',
	textBorderSize: 2
};
var player = {
	id: -1,
	x: global.screenWidth / 2,
	y: global.screenHeight / 2,
	screenWidth: global.screenWidth,
	screenHeight: global.screenHeight,
	target: {x: 0, y: 0}
};
global.player = player;

if ( /Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent) ) {
	global.mobile = true;
}

function startGame(type, key) {
	//set global variables
	global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0,25);
	playerNameInput.value = '';
	global.playerType = type;
	global.screenWidth = window.innerWidth;
	global.screenHeight = window.innerHeight;
	//show the game area
	document.getElementById('startMenuWrapper').style.maxHeight = '0px';
	document.getElementById('gameAreaWrapper').style.opacity = 1;
	//[in server]:socket.handshake.query.type
	if (!socket) {
		socket = io({query:"type=" + type});
		setupSocket(socket);
	}
	if (!global.animLoopHandle)
		animloop();
	socket.emit('respawn', key);
	window.canvas.socket = socket;
	global.socket = socket;
}

window.onload = function() {
	var startBtn = document.getElementById('startButton'),
		resumeBtn  = document.getElementById('resumeButton'),
		nickErrorText = document.querySelector('#startMenu .input-error');
	var expire = new Date(); 
	expire.setTime(expire.getTime() - 1);
	//start button clicked
	startBtn.onclick = function () {
		document.cookie = "DB_KEY=0;expires=" + expire.toGMTString();
		startGame('player', '');
	};
	//enter key clicked
	playerNameInput.addEventListener('keypress', function (e) {
		var key = e.which || e.keyCode;
		if (key === global.KEY_ENTER) {
			document.cookie = "DB_KEY=0;expires=" + expire.toGMTString();
			startGame('player', '');
		}
	});
	//resume button clicked
	resumeBtn.onclick = function () {
		var db_key = document.cookie.match(new RegExp("(^| )DB_KEY=([^;]*)(;|$)")); 
		if(db_key !== null) {
			document.cookie = "DB_KEY=0;expires=" + expire.toGMTString();
			startGame('player', db_key[2]);
		} else {
			startGame('player', '');
		}
	};
};

var items = [];
var pieces = [];
var darts = [];
var bombs = [];
var users = [];
var leaderboard = [];
var small_map = {user_list:[], piece_list:[], bomb_list:[], you:{}};
var target = {x: 0, y: 0};
global.target = target;

window.canvas = new Canvas();

var c = window.canvas.cv;
var graph = c.getContext('2d');

$( "#bomb" ).click(function() {
	socket.emit('1');
	c.focus();
});
$( "#break" ).click(function() {
	var expire = new Date(), db_key = new Date().getTime() + '_' + global.player.id;
	expire.setTime(expire.getTime() + (1 * 86400000));
	document.cookie = "DB_KEY=" + db_key + ";expires=" + expire.toGMTString();
	socket.emit('3', db_key);
	c.focus();
});
$( "#avatar_fore" ).click(function() {
	socket.emit('5', true);
	c.focus();
});
$( "#avatar_back" ).click(function() {
	socket.emit('5', false);
	c.focus();
});
$( "#bomb_plus" ).click(function() {
	socket.emit('4', "bomb");
	c.focus();
});
$( "#speed_plus" ).click(function() {
	socket.emit('4', "speed");
	c.focus();
});
$( "#power_plus" ).click(function() {
	socket.emit('4', "power");
	c.focus();
});
$( "#shield" ).click(function() {
	socket.emit('6', "shield");
	c.focus();
});

function setupSocket(socket) {
	//Handle error.
	socket.on('connect_failed', function () {
		socket.close();
		global.disconnected = true;
	});
	socket.on('disconnect', function () {
		socket.close();
		global.disconnected = true;
	});
	//Handle connection.
	socket.on('welcome', function (playerSettings, nameChange) {
		player = playerSettings;
		if (nameChange) {
			player.name = global.playerName;
		} else {
			global.playerName = player.name;
		}
		player.screenWidth = global.screenWidth;
		player.screenHeight = global.screenHeight;
		player.target = window.canvas.target;
		global.player = player;
		socket.emit('gotit', player);
		global.gameStart = true;
		c.focus();
	});
	socket.on('gameSetup', function(data) {
		global.gameWidth = data.gameWidth;
		global.gameHeight = data.gameHeight;
		resize();
	});

	socket.on('leaderboard', function (data) {
		leaderboard = data;
		var leader = '<span class="title">Score Ranking</span>';
		for (var i = 0; i < leaderboard.length; i++) {
			leader += '<br />';
			if (leaderboard[i].id == player.id) {
				if(leaderboard[i].name.length !== 0)
					leader += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
				else
					leader += '<span class="me">' + (i + 1) + ". No Name</span>";
			} else {
				if(leaderboard[i].name.length !== 0)
					leader += (i + 1) + '. ' + leaderboard[i].name;
				else
					leader += (i + 1) + '. No Name';
			}
		}
		document.getElementById('ranking').innerHTML = leader;
	});
	socket.on('small_map', function (data) {
		small_map = data;
	});
	//handle update
	socket.on('serverTellPlayerMove', function (userData, itemsList, piecesList, dartList, bombsList) {
		var playerData;
		//find self
		for (var i = 0; i < userData.length; i++) {
			if (typeof(userData[i].id) == "undefined") {
				playerData = userData[i];
				break;
			}
		}
		//renew self data
		player.x = playerData.x;
		player.y = playerData.y;
		document.getElementById('level_status').innerHTML = "Level : " + playerData.level;
		document.getElementById('score_status').innerHTML = "Score : " + playerData.score;
		document.getElementById('point_status').innerHTML = "Skill Points left : " + playerData.skillpoint;
		document.getElementById('bomb_status').innerHTML = "Bombs left : " + playerData.bombNum;
		document.getElementById('speed_status').style.width = playerData.speed + "%";
		document.getElementById('power_status').style.width = playerData.power + "%";
		document.getElementById('exp_status').style.width = Math.floor(100 * playerData.score / Math.pow(2, playerData.level)) + "%";
		document.getElementById('exp_status').innerHTML = playerData.score + "/" + Math.pow(2, playerData.level);
		document.getElementById('shield').src = (playerData.shield > 0) ? "img/shield.png" : "img/shield_no.png";
		document.getElementById('shield_status').innerHTML = "x" + playerData.shield;
		document.getElementById('dart').src = (playerData.dart > 0) ? "img/dart.png" : "img/dart_no.png";
		document.getElementById('dart_status').innerHTML = "x" + playerData.dart;
		//put to list
		users = userData;
		items = itemsList;
		pieces = piecesList;
		darts = dartList;
		bombs = bombsList;
	});
	// Death.
	socket.on('RIP', function (data) {
		global.gameStart = false;
		reason = data;
		global.died = true;
		window.setTimeout(function() {
			document.getElementById('gameAreaWrapper').style.opacity = 0;
			document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
			global.died = false;
			if (global.animLoopHandle) {
				window.cancelAnimationFrame(global.animLoopHandle);
				global.animLoopHandle = undefined;
			}
		}, 2500);
	});

	socket.on('kick', function (data) {
		global.gameStart = false;
		reason = data;
		global.kicked = true;
		socket.close();
	});
}

function drawCircle(centerX, centerY, radius) {
	graph.beginPath();
	graph.arc(centerX, centerY, radius, 0, 2 * Math.PI, false);
	graph.closePath();
	graph.stroke();
	graph.fill();
}

function drawText(centerX, centerY, content) {
	var fontSize = 15;
	graph.font = 'bold ' + fontSize + 'px sans-serif';
	graph.lineWidth = playerConfig.textBorderSize;
	graph.fillStyle = playerConfig.textColor;
	graph.strokeStyle = playerConfig.textBorder;
	graph.textAlign = 'center';
	graph.textBaseline = 'middle';
	graph.strokeText(content, centerX, centerY);
	graph.fillText(content, centerX, centerY);
}

function drawItem(item) {
	var x = item.x - player.x + global.screenWidth / 2;
	var y = item.y - player.y + global.screenHeight / 2;
	var img = document.getElementById("item_" + item.type);
	graph.drawImage(img, x - 19, y - 19);
}

function drawPiece(piece) {
	var x = piece.x - player.x + global.screenWidth / 2;
	var y = piece.y - player.y + global.screenHeight / 2;
	var img;
	if (piece.targetDir.x === 0){
		if (piece.targetDir.y >= 0)
			img = document.getElementById("piece_" + piece.score + "_down");
		else
			img = document.getElementById("piece_" + piece.score + "_up");
	} else {
		if (piece.targetDir.x > 0)
			img = document.getElementById("piece_" + piece.score + "_right");
		else
			img = document.getElementById("piece_" + piece.score + "_left");
	}
	graph.drawImage(img, x - 30, y - 30);
}

function drawDart(dart) {
	var x = dart.x - player.x + global.screenWidth / 2;
	var y = dart.y - player.y + global.screenHeight / 2;
	graph.strokeStyle = "#000000";
	graph.fillStyle = "#000000";
	graph.lineWidth = 0;
	drawCircle(x, y, 2, 30);
}

function drawBomb(bomb) {
	var x = bomb.x - player.x + global.screenWidth / 2;
	var y = bomb.y - player.y + global.screenHeight / 2;
	var img;
	if (bomb.exploded) {
		img = document.getElementById("explosion");
		graph.drawImage(img, x - bomb.range, y - bomb.range, bomb.range * 2, bomb.range * 2);
	} else {
		if (bomb.transparent && (bomb.owner !== player.id)) {
			graph.globalAlpha = 0.1;
		}
		img = document.getElementById("item_bomb");
		graph.drawImage(img, x - 50, y - 57);
		var timetext = "00：00";
		if (bomb.time > 0) {
			timetext = bomb.time.toFixed(2).replace(".", "：");
			if (timetext.length < 5)
				timetext = "0" + timetext;
		}
		drawText(x, y, timetext);
		graph.globalAlpha = 1;
	}
}

function drawUser(user) {
	var x = user.x - player.x + global.screenWidth / 2;
	var y = user.y - player.y + global.screenHeight / 2;
	if (user.opposite) {
		graph.strokeStyle = "rgba(162,0,255,0.5)";
		graph.fillStyle = "rgba(162,0,255,0.5)";
		drawCircle(x, y, 45);
	} else if (user.protection) {
		graph.strokeStyle = "rgba(255,165,0,0.5)";
		graph.fillStyle = "rgba(255,165,0,0.5)";
		graph.lineWidth = 0;
		drawCircle(x, y, 45);
	}
	var img = document.getElementById("player_" + user.avatar);
	graph.drawImage(img, x - 35, y - 40);
	//draw username
	var nameCell = "";
	if(typeof(user.id) == "undefined")
		nameCell = player.name;
	else
		nameCell = user.name;
	drawText(x, y + user.radius + 15, nameCell);
}

function drawSmall_map() {
	var mapStart_x = global.screenWidth - 10 - global.mapWidth;
	var mapStart_y = global.screenHeight - 10 - global.mapHeight;
	//draw map
	graph.strokeStyle = "#00dddd";
	graph.fillStyle = "#000495";
	graph.lineWidth = 10;
	graph.beginPath();
	graph.moveTo(mapStart_x, mapStart_y);
	graph.lineTo(mapStart_x + global.mapWidth, mapStart_y);
	graph.lineTo(mapStart_x + global.mapWidth, mapStart_y + global.mapHeight);
	graph.lineTo(mapStart_x, mapStart_y + global.mapHeight);
	graph.closePath();
	graph.stroke();
	graph.fill();
	//draw grid
	graph.strokeStyle = "#33ff33";
	graph.lineWidth = 1;
	graph.beginPath();
	for (var i = mapStart_x; i < mapStart_x + global.mapWidth; i += global.mapWidth / 10) {
		graph.moveTo(i, mapStart_y);
		graph.lineTo(i, mapStart_y + global.mapHeight);
	}
	for (i = mapStart_y; i < mapStart_y + global.mapHeight; i += global.mapHeight / 10) {
		graph.moveTo(mapStart_x, i);
		graph.lineTo(mapStart_x + global.mapWidth, i);
	}
	graph.stroke();
	//draw piece
	var scale = small_map.gameWidth / global.mapWidth;
	var x = 0, y = 0;
	for (i = 0; i < small_map.piece_list.length; i++) {
		x = mapStart_x + small_map.piece_list[i].x / scale;
		y = mapStart_y + small_map.piece_list[i].y / scale;
		graph.strokeStyle = "#ff00ff";
		graph.fillStyle = "#ff00ff";
		graph.lineWidth = 1;
		drawCircle(x, y, 2);
	}
	//draw bomb
	for (i = 0; i < small_map.bomb_list.length; i++) {
		x = mapStart_x + small_map.bomb_list[i].x / scale;
		y = mapStart_y + small_map.bomb_list[i].y / scale;
		graph.strokeStyle = "rgba(255,0,0,0.4)";
		graph.fillStyle = "rgba(255,0,0,0.4)";
		graph.lineWidth = 1;
		drawCircle(x, y, small_map.bomb_list[i].range / scale);
		graph.strokeStyle = "#000000";
		graph.fillStyle = "#000000";
		drawCircle(x, y, 2);
	}
	//draw other player
	for (i = 0; i < small_map.user_list.length; i++) {
		x = mapStart_x + small_map.user_list[i].x / scale;
		y = mapStart_y + small_map.user_list[i].y / scale;
		graph.strokeStyle = "#00ff00";
		graph.fillStyle = "#00ff00";
		graph.lineWidth = 1;
		drawCircle(x, y, 2);
	}
	//draw player
	x = mapStart_x + small_map.you.x / scale;
	y = mapStart_y + small_map.you.y / scale;
	graph.strokeStyle = "#ffff00";
	graph.fillStyle = "#ffff00";
	graph.lineWidth = 1;
	drawCircle(x, y, 2);
	//draw screen
	var map_screen_left = mapStart_x + Math.max(small_map.you.x - global.screenWidth/2, 0) / scale;
	var map_screen_right = mapStart_x + Math.min(small_map.you.x + global.screenWidth/2, small_map.gameWidth) / scale;
	var map_screen_up = mapStart_y + Math.max(small_map.you.y - global.screenHeight/2, 0) / scale;
	var map_screen_down = mapStart_y + Math.min(small_map.you.y + global.screenHeight/2, small_map.gameHeight) / scale;
	graph.strokeStyle = "#aaaaaa";
	graph.lineWidth = 2;
	graph.beginPath();
	graph.moveTo(map_screen_left, map_screen_up);
	graph.lineTo(map_screen_right, map_screen_up);
	graph.lineTo(map_screen_right, map_screen_down);
	graph.lineTo(map_screen_left, map_screen_down);
	graph.closePath();
	graph.stroke();
}

function drawgrid() {
	graph.strokeStyle = global.lineColor;
	for (var x = 0; x < global.gameWidth; x += global.gameWidth/100) {
		if ((x >= (player.x - global.screenWidth/2)) && (x <= (player.x + global.screenWidth/2))) {
			if ((x % (global.gameWidth/10)) === 0)
				graph.lineWidth = 2;
			else
				graph.lineWidth = 1;
			graph.beginPath();
			graph.moveTo(x - player.x + global.screenWidth/2, Math.max(0, - player.y + global.screenHeight/2));
			graph.lineTo(x - player.x + global.screenWidth/2, Math.min(global.screenHeight, global.gameHeight - player.y + global.screenHeight/2));
			graph.stroke();
		}
	}
	for (var y = 0; y < global.gameHeight; y += global.gameHeight/100) {
		if ((y >= (player.y - global.screenHeight/2)) && (y <= (player.y + global.screenHeight/2))) {
			if ((y % (global.gameHeight/10)) === 0)
				graph.lineWidth = 2;
			else
				graph.lineWidth = 1;
			graph.beginPath();
			graph.moveTo(Math.max(0, - player.x + global.screenWidth/2), y - player.y + global.screenHeight/2);
			graph.lineTo(Math.min(global.screenWidth, global.gameWidth - player.x + global.screenWidth/2), y - player.y + global.screenHeight/2);
			graph.stroke();
		}
	}
}

function drawborder() {
    graph.lineWidth = 2;
    graph.strokeStyle = global.lineColor;

    // Left-vertical.
    if (player.x <= global.screenWidth/2) {
        graph.beginPath();
        graph.moveTo(global.screenWidth/2 - player.x, 0 ? player.y > global.screenHeight/2 : global.screenHeight/2 - player.y);
        graph.lineTo(global.screenWidth/2 - player.x, global.gameHeight + global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Top-horizontal.
    if (player.y <= global.screenHeight/2) {
        graph.beginPath();
        graph.moveTo(0 ? player.x > global.screenWidth/2 : global.screenWidth/2 - player.x, global.screenHeight/2 - player.y);
        graph.lineTo(global.gameWidth + global.screenWidth/2 - player.x, global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Right-vertical.
    if (global.gameWidth - player.x <= global.screenWidth/2) {
        graph.beginPath();
        graph.moveTo(global.gameWidth + global.screenWidth/2 - player.x,
                     global.screenHeight/2 - player.y);
        graph.lineTo(global.gameWidth + global.screenWidth/2 - player.x,
                     global.gameHeight + global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }

    // Bottom-horizontal.
    if (global.gameHeight - player.y <= global.screenHeight/2) {
        graph.beginPath();
        graph.moveTo(global.gameWidth + global.screenWidth/2 - player.x,
                     global.gameHeight + global.screenHeight/2 - player.y);
        graph.lineTo(global.screenWidth/2 - player.x,
                     global.gameHeight + global.screenHeight/2 - player.y);
        graph.strokeStyle = global.lineColor;
        graph.stroke();
    }
}

window.requestAnimFrame = (function() {
    return  window.requestAnimationFrame       ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.msRequestAnimationFrame     ||
            function( callback ) {
                window.setTimeout(callback, 1000 / 60);
            };
})();

window.cancelAnimFrame = (function(handle) {
    return  window.cancelAnimationFrame     ||
            window.mozCancelAnimationFrame;
})();

function animloop() {
    global.animLoopHandle = window.requestAnimFrame(animloop);
    gameLoop();
}

function gameLoop() {
	if (global.died) {
		//player died
		graph.fillStyle = '#333333';
		graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
		graph.textAlign = 'center';
		graph.fillStyle = '#FFFFFF';
		graph.font = 'bold 30px sans-serif';
		graph.fillText(reason, global.screenWidth / 2, global.screenHeight / 2);
	} else if (!global.disconnected) {
		//in game
		if (global.gameStart) {
			//draw background and grid and border
			graph.fillStyle = global.backgroundColor;
			graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
			drawgrid();
			drawborder();
			//draw objects
			graph.lineJoin = 'round';
			graph.lineCap = 'round';
			items.forEach(drawItem);
			pieces.forEach(drawPiece);
			darts.forEach(drawDart);
			bombs.forEach(drawBomb);
			users.forEach(drawUser);
			//blind mode
			if (global.blindMode) {
				graph.strokeStyle = "#000000";
				graph.fillStyle = "#000000";
				graph.lineWidth = 1;
				graph.beginPath();
				graph.rect(0,0,global.screenWidth, global.screenHeight);
				graph.arc(global.screenWidth/2, global.screenHeight/2, global.screenHeight/4, 0, 2 * Math.PI, true);
				graph.closePath();
				graph.fill();
			}
			drawSmall_map();
			socket.emit('0', window.canvas.target); // playerSendTarget "Heartbeat".
		} else {
			graph.fillStyle = '#333333';
			graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
			graph.textAlign = 'center';
			graph.fillStyle = '#FFFFFF';
			graph.font = 'bold 30px sans-serif';
			graph.fillText('Game Loading‧‧‧', global.screenWidth / 2, global.screenHeight / 2);
		}
	} else {
		//disconnected
		graph.fillStyle = '#333333';
		graph.fillRect(0, 0, global.screenWidth, global.screenHeight);
		graph.textAlign = 'center';
		graph.fillStyle = '#FFFFFF';
		graph.font = 'bold 30px sans-serif';
		if (global.kicked) {
			if (reason !== '') {
				graph.fillText('You were kicked for:', global.screenWidth / 2, global.screenHeight / 2 - 20);
				graph.fillText(reason, global.screenWidth / 2, global.screenHeight / 2 + 20);
			}
			else {
				graph.fillText('You were kicked!', global.screenWidth / 2, global.screenHeight / 2);
			}
		}
		else {
			graph.fillText('Disconnected!', global.screenWidth / 2, global.screenHeight / 2);
		}
	}
}

window.addEventListener('resize', resize);

function resize() {
	player.screenWidth = c.width = global.screenWidth = global.playerType == 'player' ? window.innerWidth : global.gameWidth;
	player.screenHeight = c.height = global.screenHeight = global.playerType == 'player' ? window.innerHeight : global.gameHeight;
	socket.emit('windowResized', { screenWidth: global.screenWidth, screenHeight: global.screenHeight });
}
