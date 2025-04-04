import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, set, update, remove, get, onValue, push } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const firebaseConfig = {
    databaseURL: "https://game-f18e0-default-rtdb.firebaseio.com/"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase();

let currentPhase = 'lobby';
let roles = {};
let players = {};
let nightActions = {};
let rolePopupDisplayed = false;
let roundNumber = 0;
let nightPhaseTimeout = null;
let actionButtonsCreated = false;
let isInitializingNightPhase = false;

// Event listener to host a room
document.getElementById("hostBtn").addEventListener("click", function() {
    let playerName = document.getElementById("playerName").value;
    if (!playerName) return alert("Enter your name!");
    let roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    sessionStorage.setItem("roomCode", roomCode);
    sessionStorage.setItem("playerName", playerName);
    set(ref(db, "rooms/" + roomCode), {
        host: playerName,
        players: { [playerName]: true },
        phase: 'lobby',
        roles: {},
        nightActions: {},
        votes: {},
        roundNumber: 0,
        chat: {}
    });
    enterLobby(roomCode, playerName);
});

// Event listener to join a room
document.getElementById("joinBtn").addEventListener("click", function() {
    let roomCode = document.getElementById("roomCode").value.trim();
    let playerName = document.getElementById("playerName").value.trim();
    if (!roomCode || !playerName) return alert("Enter name and room code!");

    const roomRef = ref(db, "rooms/" + roomCode);
    get(roomRef).then(snapshot => {
        if (snapshot.exists()) {
            let playersInRoom = snapshot.val().players;
            if (playersInRoom[playerName]) {
                alert("This name is already taken in the lobby. Please choose a different name.");
                return;
            }

            sessionStorage.setItem("roomCode", roomCode);
            sessionStorage.setItem("playerName", playerName);
            update(ref(db, "rooms/" + roomCode + "/players"), { [playerName]: true });
            enterLobby(roomCode, playerName);
        } else {
            alert("Room does not exist!");
        }
    });
});

function enterLobby(roomCode, playerName) {
    if (sessionStorage.getItem("wasEliminated") === "true") {
        showEliminatedScreen();
        return;
    }

    document.getElementById("home").style.display = "none";
    document.getElementById("lobby").style.display = "block";
    document.getElementById("gameOver").style.display = "none";
    document.getElementById("gameContainer").style.display = "none";
    document.getElementById("roomCodeDisplay").innerText = "Room Code: " + roomCode;

    let roomRef = ref(db, "rooms/" + roomCode);

    onValue(roomRef, (snapshot) => {
        let data = snapshot.val();
        if (data) {
            document.getElementById("hostName").innerText = "Host: " + data.host;
            let playersList = document.getElementById("playersList");
            playersList.innerHTML = "";

            let sortedPlayers = Object.keys(data.players);
            sortedPlayers.sort((a, b) => (a === data.host ? -1 : b === data.host ? 1 : 0));

            sortedPlayers.forEach(player => {
                let div = document.createElement("div");
                div.className = "player-name";
                if (player === data.host) {
                    div.classList.add("host-name");
                }
                div.innerText = player;
                playersList.appendChild(div);
            });

            document.getElementById("startGameBtn").style.display = playerName === data.host && sortedPlayers.length >= 2 ? "block" : "none";

            if (data.phase === 'night' || data.phase === 'day') {
                startGame(data.roles, data.phase);
            }
        }
    });

    onValue(ref(db, "rooms/" + roomCode + "/players"), (snapshot) => {
        let players = snapshot.val();
        if (players) {
            let newPlayers = Object.keys(players);
            let newPlayer = newPlayers[newPlayers.length - 1];
            if (newPlayer) {
                showPopup(newPlayer + " joined the room!");
            }
        }
    });

    onValue(ref(db, "rooms/" + roomCode + "/chat"), (snapshot) => {
        let chatBox = document.getElementById("chatBox");
        let messages = snapshot.val();
        if (messages) {
            chatBox.innerHTML = "";
            Object.values(messages).forEach(msg => {
                chatBox.innerHTML += `<p><strong>${msg.player}:</strong> ${msg.message}</p>`;
            });
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });

    onValue(ref(db, `rooms/${roomCode}/gameOver`), (snapshot) => {
        let gameOverData = snapshot.val();
        if (gameOverData) {
            showWinScreen(gameOverData.winner + " Wins!", gameOverData.message);
        }
    });
}

function showEliminatedScreen() {
    document.getElementById("gameOver").style.display = "block";
    document.getElementById("gameOverMessage").innerText = "You have been eliminated!";
    document.getElementById("votingContainer").style.display = "none";
    document.getElementById("secretActionsContainer").style.display = "none";
}

document.getElementById("leaveBtn").addEventListener("click", function() {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    if (roomCode && playerName) {
        remove(ref(db, "rooms/" + roomCode + "/players/" + playerName));
        sessionStorage.removeItem("roomCode");
        sessionStorage.removeItem("playerName");
        sessionStorage.removeItem("wasEliminated");
        location.reload();
    }
});

document.getElementById("leaveGameBtn").addEventListener("click", function() {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    if (roomCode && playerName) {
        remove(ref(db, "rooms/" + roomCode + "/players/" + playerName));
        sessionStorage.removeItem("roomCode");
        sessionStorage.removeItem("playerName");
        sessionStorage.removeItem("wasEliminated");
        document.getElementById("gameContainer").style.display = "none";
        document.getElementById("home").style.display = "block";
    }
});

document.getElementById("startGameBtn").addEventListener("click", function() {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    if (roomCode && playerName) {
        let roomRef = ref(db, "rooms/" + roomCode);
        get(roomRef).then(snapshot => {
            let data = snapshot.val();
            if (data) {
                players = Object.keys(data.players);
                assignRoles(players);
                update(ref(db, "rooms/" + roomCode), { 
                    phase: 'night', 
                    roles: roles, 
                    roundNumber: 1 
                });
                startGame(roles, 'night');
            }
        });
    }
});

function assignRoles(players) {
    let shuffledPlayers = players.slice().sort(() => Math.random() - 0.5);
    roles = {
        [shuffledPlayers[0]]: 'Pushpa',
        [shuffledPlayers[1]]: 'Shekhawat',
        [shuffledPlayers[2]]: 'MLA Siddappa',
    };
    shuffledPlayers.slice(3).forEach(player => {
        roles[player] = 'Syndicate Member';
    });

    let roomCode = sessionStorage.getItem("roomCode");
    update(ref(db, "rooms/" + roomCode + "/roles"), roles);
}

function startGame(roles, phase) {
    if (sessionStorage.getItem("wasEliminated") === "true") {
        showEliminatedScreen();
        return;
    }

    document.getElementById("lobby").style.display = "none";
    document.getElementById("gameContainer").style.display = "block";
    document.getElementById("gameOver").style.display = "none";

    let playerName = sessionStorage.getItem("playerName");
    let playerRole = roles[playerName];

    if (playerRole) {
        document.getElementById("roleAlert").innerHTML = `You are <b>${playerRole}</b>`;
    }

    if (phase === 'night') {
        setTimeout(() => startNightPhase(), 3000);
    } else {
        startDayPhase();
    }
}

function startNightPhase(roomData = null) {
    if (currentPhase === 'night' && actionButtonsCreated) return;
    if (isInitializingNightPhase) return;
    
    isInitializingNightPhase = true;
    currentPhase = 'night';
    actionButtonsCreated = false;
    clearTimeout(nightPhaseTimeout);
    
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    
    document.getElementById("votingContainer").innerHTML = "";
    document.getElementById("secretActionsContainer").innerHTML = "";
    document.getElementById("phaseAnimation").innerHTML = '<img src="assets/images/nightttt.gif" alt="Night Phase">';
    document.getElementById("actionButtons").style.display = "block";
    document.getElementById("secretActionsContainer").style.display = "block";

    const fetchData = roomData ? Promise.resolve(roomData) : get(ref(db, `rooms/${roomCode}`)).then(snapshot => snapshot.val());
    
    fetchData.then(data => {
        if (!data || !data.roles || !data.players[playerName]) {
            isInitializingNightPhase = false;
            if (data && !data.players[playerName]) {
                showEliminatedScreen();
            }
            return;
        }
        
        if (actionButtonsCreated) {
            isInitializingNightPhase = false;
            return;
        }
        
        actionButtonsCreated = true;
        let role = data.roles[playerName];
        let container = document.getElementById("secretActionsContainer");
        container.innerHTML = "";
        
        Object.keys(data.players).forEach(target => {
            if (target !== playerName) {
                let button = document.createElement("button");
                button.className = "btn";
                
                switch (role) {
                    case 'Pushpa':
                        button.innerText = `Eliminate ${target}`;
                        button.onclick = () => {
                            update(ref(db, `rooms/${roomCode}/nightActions/${playerName}`), { 
                                action: 'Eliminate', 
                                target: target 
                            }).then(() => {
                                alert(`You will eliminate ${target} at night.`);
                                button.disabled = true;
                            });
                        };
                        break;
                    case 'Shekhawat':
                        button.innerText = `Investigate ${target}`;
                        button.onclick = () => {
                            update(ref(db, `rooms/${roomCode}/nightActions/${playerName}`), { 
                                action: 'Investigate', 
                                target: target 
                            }).then(() => {
                                alert(`You will investigate ${target} at night.`);
                                button.disabled = true;
                            });
                        };
                        break;
                    case 'MLA Siddappa':
                        button.innerText = `Save ${target}`;
                        button.onclick = () => {
                            update(ref(db, `rooms/${roomCode}/nightActions/${playerName}`), { 
                                action: 'Heal', 
                                target: target 
                            }).then(() => {
                                alert(`You will try to save ${target} at night.`);
                                button.disabled = true;
                            });
                        };
                        break;
                    default:
                        return;
                }
                
                if (button.innerText) {
                    container.appendChild(button);
                }
            }
        });

        nightPhaseTimeout = setTimeout(() => {
            if (currentPhase === 'night') {
                endNightPhase();
            }
        }, 50000);
        
        isInitializingNightPhase = false;
    }).catch(error => {
        console.error("Error initializing night phase:", error);
        isInitializingNightPhase = false;
    });
}

function endNightPhase() {
    if (currentPhase !== 'night') return;
    
    currentPhase = 'transition';
    clearTimeout(nightPhaseTimeout);
    document.getElementById("secretActionsContainer").innerHTML = "";
    actionButtonsCreated = false;
    applyNightActions();
}

function applyNightActions() {
    let roomCode = sessionStorage.getItem("roomCode");
    let roomRef = ref(db, `rooms/${roomCode}`);
    get(roomRef).then(snapshot => {
        let data = snapshot.val();
        if (data) {
            let chatBox = document.getElementById("chatBox");
            let nightActions = data.nightActions || {};
            let healedPlayers = new Set();

            Object.entries(nightActions).forEach(([player, { action, target }]) => {
                if (action === 'Heal') {
                    healedPlayers.add(target);
                }
            });

            Object.entries(nightActions).forEach(([player, { action, target }]) => {
                if (action === 'Eliminate' && !healedPlayers.has(target)) {
                    let chatRef = ref(db, "rooms/" + roomCode + "/chat");
                    let newMessageRef = push(chatRef);
                    set(newMessageRef, { player: "System", message: `${target} was caught in action and killed by Pushpa.` });

                    delete data.players[target];
                    checkIfEliminated(target);
                    checkWinConditions(data.players, data.roles);
                }
                if (action === 'Investigate') {
                    if (player === sessionStorage.getItem("playerName")) {
                        chatBox.innerHTML += `<p>You investigated ${target}, who is ${data.roles[target]}.</p>`;
                    }
                }
                if (action === 'Heal' && healedPlayers.has(target)) {
                    let chatRef = ref(db, "rooms/" + roomCode + "/chat");
                    let newMessageRef = push(chatRef);
                    set(newMessageRef, { player: "System", message: `MLA Siddappa saved ${target} from Pushpa!` });
                }
            });

            chatBox.scrollTop = chatBox.scrollHeight;

            update(roomRef, {
                players: data.players,
                phase: 'day',
                nightActions: {},
                roundNumber: data.roundNumber + 1
            }).then(() => {
                setTimeout(() => {
                    document.getElementById("secretActionsContainer").style.display = "none";
                    startDayPhase();
                }, 3000);
            });
        }
    });
}

function startDayPhase(roomData = null) {
    currentPhase = 'day';
    let roomCode = sessionStorage.getItem("roomCode");
    let votingContainer = document.getElementById("votingContainer");
    votingContainer.innerHTML = "";

    update(ref(db, `rooms/${roomCode}/votes`), {});

    document.getElementById("gameContainer").style.display = "block";
    document.getElementById("actionButtons").style.display = "none";
    document.getElementById("secretActionsContainer").innerHTML = "";
    document.getElementById("secretActionsContainer").style.display = "none";
    document.getElementById("phaseAnimation").innerHTML = '<img src="assets/images/dayy.gif" alt="Day Phase">';

    const fetchData = roomData ? Promise.resolve(roomData) : get(ref(db, `rooms/${roomCode}`)).then(snapshot => snapshot.val());
    
    fetchData.then(data => {
        if (!data || !data.players) return;

        let playerName = sessionStorage.getItem("playerName");

        if (data.players[playerName]) {
            Object.keys(data.players).forEach(player => {
                if (player !== playerName) {
                    let voteBtn = document.createElement("button");
                    voteBtn.className = "btn";
                    voteBtn.innerText = `Vote for ${player}`;
                    voteBtn.onclick = () => {
                        votePlayer(player);
                    };
                    votingContainer.appendChild(voteBtn);
                }
            });
        }

        setTimeout(() => processVotes(), 50000);
    });
}

function votePlayer(player) {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    
    get(ref(db, `rooms/${roomCode}/players/${playerName}`)).then(snapshot => {
        if (!snapshot.exists()) {
            alert("You have been eliminated and cannot vote!");
            return;
        }
        
        get(ref(db, `rooms/${roomCode}/votes/${playerName}`)).then(voteSnapshot => {
            if (voteSnapshot.exists()) {
                alert("You have already voted!");
                return;
            }
            
            update(ref(db, `rooms/${roomCode}/votes`), { [playerName]: player }).then(() => {
                let chatRef = ref(db, "rooms/" + roomCode + "/chat");
                let newMessageRef = push(chatRef);
                set(newMessageRef, { player: "System", message: `${playerName} voted for ${player}` });
            });
        });
    });
}

function processVotes() {
    clearTimeout(nightPhaseTimeout);
    
    let roomCode = sessionStorage.getItem("roomCode");
    let roomRef = ref(db, `rooms/${roomCode}`);
    
    document.getElementById("votingContainer").innerHTML = "";
    document.getElementById("actionButtons").style.display = "none";
    document.getElementById("secretActionsContainer").innerHTML = "";

    get(roomRef).then(snapshot => {
        let data = snapshot.val();
        if (!data || !data.votes) return;

        let voteCounts = {};
        Object.values(data.votes).forEach(vote => {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        });

        let maxVotes = Math.max(...Object.values(voteCounts));
        let playersToEliminate = Object.keys(voteCounts).filter(player => voteCounts[player] === maxVotes);

        if (playersToEliminate.length === 1) {
            let playerToEliminate = playersToEliminate[0];
            let chatRef = ref(db, "rooms/" + roomCode + "/chat");
            let newMessageRef = push(chatRef);
            set(newMessageRef, { player: "System", message: `${playerToEliminate} has been eliminated by voting.` });

            delete data.players[playerToEliminate];
            update(roomRef, { players: data.players });

            checkIfEliminated(playerToEliminate);
            checkWinConditions(data.players, data.roles);
        } else {
            let chatRef = ref(db, "rooms/" + roomCode + "/chat");
            let newMessageRef = push(chatRef);
            set(newMessageRef, { player: "System", message: "No one was eliminated due to a tie in voting." });
        }

        update(roomRef, { votes: {} }).then(() => {
            update(roomRef, { phase: 'night' }).then(() => {
                get(roomRef).then(updatedSnapshot => {
                    startNightPhase(updatedSnapshot.val());
                });
            });
        });
    });
}

function checkWinConditions(players, roles) {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");

    let pushpaPlayer = Object.keys(roles).find(player => roles[player] === 'Pushpa');
    if (!players[pushpaPlayer]) {
        let chatRef = ref(db, "rooms/" + roomCode + "/chat");
        let newMessageRef = push(chatRef);
        set(newMessageRef, { player: "System", message: "Pushpa has been eliminated. The Syndicate wins!" });

        update(ref(db, `rooms/${roomCode}`), { gameOver: { winner: "Syndicate", message: "Pushpa has been eliminated. The Syndicate wins!" } });
        return;
    }

    let totalPlayers = Object.keys(players).length;
    let initialPlayerCount = Object.keys(roles).length;
    if (totalPlayers <= Math.floor(initialPlayerCount / 2)) {
        let chatRef = ref(db, "rooms/" + roomCode + "/chat");
        let newMessageRef = push(chatRef);
        set(newMessageRef, { player: "System", message: "Half of the players have been eliminated. Pushpa wins!" });

        update(ref(db, `rooms/${roomCode}`), { gameOver: { winner: "Pushpa", message: "Half of the players have been eliminated. Pushpa wins!" } });
        return;
    }
}

function showWinScreen(title, message) {
    document.getElementById("winTitle").innerText = title;
    document.getElementById("winMessage").innerText = message;
    document.getElementById("winScreen").style.display = "block";
    document.getElementById("votingContainer").style.display = "none";
    document.getElementById("secretActionsContainer").style.display = "none";
}

function checkIfEliminated(player) {
    let playerName = sessionStorage.getItem("playerName");
    if (player === playerName) {
        let roomCode = sessionStorage.getItem("roomCode");
        
        remove(ref(db, "rooms/" + roomCode + "/players/" + playerName));
        remove(ref(db, "rooms/" + roomCode + "/votes/" + playerName));
        
        document.getElementById("gameOver").style.display = "block";
        
        sessionStorage.setItem("wasEliminated", "true");
    }
}

document.getElementById("returnHomeBtn").addEventListener("click", function() {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    
    if (roomCode && playerName) {
        remove(ref(db, "rooms/" + roomCode + "/players/" + playerName));
    }
    
    sessionStorage.clear();
    location.reload();
});

document.getElementById("winReturnHomeBtn").addEventListener("click", function() {
    sessionStorage.clear();
    location.reload();
});

document.getElementById("sendMessageBtn").addEventListener("click", function() {
    let message = document.getElementById("chatInput").value;
    if (message) {
        let roomCode = sessionStorage.getItem("roomCode");
        let playerName = sessionStorage.getItem("playerName");
        let chatRef = ref(db, "rooms/" + roomCode + "/chat");
        let newMessageRef = push(chatRef);
        set(newMessageRef, { player: playerName, message: message });
        document.getElementById("chatInput").value = "";
    }
});

function showPopup(message) {
    let popup = document.getElementById("playerJoinedPopup");
    popup.innerText = message;
    popup.style.display = "block";
    popup.style.opacity = "1";
    setTimeout(() => {
        popup.style.opacity = "0";
        setTimeout(() => {
            popup.style.display = "none";
        }, 500);
    }, 3000);
}

const roomCode = sessionStorage.getItem("roomCode");
const playerName = sessionStorage.getItem("playerName");

if (roomCode && playerName) {
    enterLobby(roomCode, playerName);
}