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

// Event listener to host a room
document.getElementById("hostBtn").addEventListener("click", function () {
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
document.getElementById("joinBtn").addEventListener("click", function () {
    let roomCode = document.getElementById("roomCode").value.trim();
    let playerName = document.getElementById("playerName").value.trim();
    if (!roomCode || !playerName) return alert("Enter name and room code!");

    const roomRef = ref(db, "rooms/" + roomCode);
    get(roomRef).then(snapshot => {
        if (snapshot.exists()) {
            // Check for unique names
            let playersInRoom = snapshot.val().players;
            if (playersInRoom[playerName]) {
                alert("This name is already taken in the lobby. Please choose a different name.");
                return;
            }

            // Update players in the room
            sessionStorage.setItem("roomCode", roomCode);
            sessionStorage.setItem("playerName", playerName);
            update(ref(db, "rooms/" + roomCode + "/players"), { [playerName]: true });
            enterLobby(roomCode, playerName);
        } else {
            alert("Room does not exist!");
        }
    });
});

// Enter lobby and display players
function enterLobby(roomCode, playerName) {
    document.getElementById("home").style.display = "none";
    document.getElementById("lobby").style.display = "block";
    document.getElementById("roomCodeDisplay").innerText = "Room Code: " + roomCode;

    let roomRef = ref(db, "rooms/" + roomCode);

    // Listen for game state changes (e.g., phase changes)
    onValue(roomRef, (snapshot) => {
        let data = snapshot.val();
        if (data) {
            // Update the lobby UI
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

            // Only show the start button to the host if there are at least 2 players
            document.getElementById("startGameBtn").style.display = playerName === data.host && sortedPlayers.length >= 2 ? "block" : "none";

            // Check if the game is ongoing
            if (data.phase === 'night' || data.phase === 'day') {
                startGame(data.roles, data.phase);
            }
        }
    });

    // Show popup when a new player joins
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

    // Update the chat box
    onValue(ref(db, "rooms/" + roomCode + "/chat"), (snapshot) => {
        let chatBox = document.getElementById("chatBox");
        let messages = snapshot.val();
        if (messages) {
            chatBox.innerHTML = ""; // Clear the chatbox before appending new messages
            Object.values(messages).forEach(msg => {
                chatBox.innerHTML += `<p><strong>${msg.player}:</strong> ${msg.message}</p>`;
            });
            chatBox.scrollTop = chatBox.scrollHeight; // Scroll to the bottom
        }
    });

    // Listen for game over state
    onValue(ref(db, `rooms/${roomCode}/gameOver`), (snapshot) => {
        let gameOverData = snapshot.val();
        if (gameOverData) {
            showWinScreen(gameOverData.winner + " Wins!", gameOverData.message);
        }
    });
}

// Leave room event
document.getElementById("leaveBtn").addEventListener("click", function () {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    if (roomCode && playerName) {
        remove(ref(db, "rooms/" + roomCode + "/players/" + playerName));
        sessionStorage.removeItem("roomCode");
        sessionStorage.removeItem("playerName");
        location.reload(); // Reload the page to reset state
    }
});

// Leave game event
document.getElementById("leaveGameBtn").addEventListener("click", function () {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    if (roomCode && playerName) {
        remove(ref(db, "rooms/" + roomCode + "/players/" + playerName));
        sessionStorage.removeItem("roomCode");
        sessionStorage.removeItem("playerName");
        document.getElementById("gameContainer").style.display = "none";
        document.getElementById("home").style.display = "block";
    }
});

// Start game event
document.getElementById("startGameBtn").addEventListener("click", function () {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    if (roomCode && playerName) {
        let roomRef = ref(db, "rooms/" + roomCode);
        get(roomRef).then(snapshot => {
            let data = snapshot.val();
            if (data) {
                players = Object.keys(data.players);
                assignRoles(players);
                update(ref(db, "rooms/" + roomCode), { phase: 'night', roles: roles, roundNumber: 1 });
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
        [shuffledPlayers[2]]: 'MLA Siddappa', // Updated to "MLA Siddappa"
    };
    shuffledPlayers.slice(3).forEach(player => {
        roles[player] = 'Syndicate Member';
    });

    // Update roles in Firebase
    let roomCode = sessionStorage.getItem("roomCode");
    update(ref(db, "rooms/" + roomCode + "/roles"), roles);
}

// Start the game
function startGame(roles, phase) {
    document.getElementById("lobby").style.display = "none";
    document.getElementById("gameContainer").style.display = "block";

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

// Show role alert
function showRoleAlert(roles) {
    let playerName = sessionStorage.getItem("playerName");
    document.getElementById("roleAlert").innerHTML = `You are <b>${roles[playerName]}</b>`;
    showPopup(`You are <b>${roles[playerName]}</b>`);
}

function startNightPhase() {
    currentPhase = 'night';
    let roomCode = sessionStorage.getItem("roomCode");
    let votingContainer = document.getElementById("votingContainer");
    votingContainer.innerHTML = "";
    document.getElementById("phaseAnimation").innerHTML = '<img src="assets/images/nightttt.gif" alt="Night Phase">';

    get(ref(db, `rooms/${roomCode}`)).then(snapshot => {
        let data = snapshot.val();
        if (!data || !data.roles) return;

        let playerName = sessionStorage.getItem("playerName");
        let role = data.roles[playerName];

        document.getElementById("actionButtons").style.display = "block";
        let secretActionsContainer = document.getElementById("secretActionsContainer");
        secretActionsContainer.innerHTML = "";

        Object.keys(data.players).forEach(target => {
            if (target !== playerName) {
                let actionButton;
                switch (role) {
                    case 'Pushpa':
                        actionButton = createActionButton(`Eliminate ${target}`, () => {
                            update(ref(db, `rooms/${roomCode}/nightActions/${playerName}`), { action: 'Eliminate', target: target }).then(() => {
                                alert(`You will eliminate ${target} at night.`);
                            });
                        });
                        break;
                    case 'Shekhawat':
                        actionButton = createActionButton(`Investigate ${target}`, () => {
                            update(ref(db, `rooms/${roomCode}/nightActions/${playerName}`), { action: 'Investigate', target: target }).then(() => {
                                alert(`You will investigate ${target} at night.`);
                            });
                        });
                        break;
                    case 'MLA Siddappa':
                        actionButton = createActionButton(`Save ${target}`, () => {
                            update(ref(db, `rooms/${roomCode}/nightActions/${playerName}`), { action: 'Heal', target: target }).then(() => {
                                alert(`You will try to save ${target} at night.`);
                            });
                        });
                        break;
                }
                if (actionButton) {
                    secretActionsContainer.appendChild(actionButton);
                }
            }
        });

        update(ref(db, `rooms/${roomCode}`), { phase: 'night' });
    });

    // Add a timeout to end the night phase after 50 seconds
    setTimeout(() => endNightPhase(), 50000);
}

function createActionButton(text, action) {
    let button = document.createElement("button");
    button.className = "btn";
    button.innerText = text;
    button.onclick = action;
    return button;
}

function endNightPhase() {
    currentPhase = 'day';
    document.getElementById("phaseAnimation").innerHTML = '<img src="assets/images/dayy.gif" alt="Day Phase">';
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

            // Process healing actions first
            Object.entries(nightActions).forEach(([player, { action, target }]) => {
                if (action === 'Heal') {
                    healedPlayers.add(target);
                }
            });

            // Process elimination and investigation actions
            Object.entries(nightActions).forEach(([player, { action, target }]) => {
                if (action === 'Eliminate' && !healedPlayers.has(target)) {
                    // Broadcast Pushpa's elimination message to everyone
                    let chatRef = ref(db, "rooms/" + roomCode + "/chat");
                    let newMessageRef = push(chatRef);
                    set(newMessageRef, { player: "System", message: `${target} was caught in action and killed by Pushpa.` });

                    delete data.players[target];
                    checkIfEliminated(target);
                    checkWinConditions(data.players, data.roles);
                }
                if (action === 'Investigate') {
                    // Send private message to Shekhawat only
                    if (player === sessionStorage.getItem("playerName")) {
                        chatBox.innerHTML += `<p>You investigated ${target}, who is ${data.roles[target]}.</p>`;
                    }
                }
                if (action === 'Heal' && healedPlayers.has(target)) {
                    // Broadcast healing message to everyone
                    let chatRef = ref(db, "rooms/" + roomCode + "/chat");
                    let newMessageRef = push(chatRef);
                    set(newMessageRef, { player: "System", message: `MLA Siddappa saved ${target} from Pushpa!` });
                }
            });

            chatBox.scrollTop = chatBox.scrollHeight;

            // Update the game state
            update(roomRef, {
                players: data.players,
                phase: 'day',
                nightActions: {} // Clear night actions after processing
            }).then(() => {
                setTimeout(() => startDayPhase(), 3000);
            });
        }
    });
}

function startDayPhase() {
    currentPhase = 'day';
    let roomCode = sessionStorage.getItem("roomCode");
    let votingContainer = document.getElementById("votingContainer");
    votingContainer.innerHTML = "";

    // Ensure the game container is visible
    document.getElementById("gameContainer").style.display = "block";

    // Check if actionButtons and secretActionsContainer exist before manipulating them
    let actionContainer1 = document.getElementById("actionButtons");
    let actionContainer2 = document.getElementById("secretActionsContainer");

    if (actionContainer1) {
        actionContainer1.innerHTML = "";
    }
    if (actionContainer2) {
        actionContainer2.innerHTML = "";
    }

    document.getElementById("phaseAnimation").innerHTML = '<img src="assets/images/dayy.gif" alt="Day Phase">';

    get(ref(db, `rooms/${roomCode}`)).then(snapshot => {
        let data = snapshot.val();
        if (!data || !data.players) return;

        let playerName = sessionStorage.getItem("playerName");

        Object.keys(data.players).forEach(player => {
            if (player !== playerName) {
                let voteBtn = createActionButton(`Vote for ${player}`, () => {
                    votePlayer(player);
                });
                votingContainer.appendChild(voteBtn);
            }
        });

        update(ref(db, `rooms/${roomCode}`), { phase: 'day' });
    });

    // Add a timeout to process votes after 50 seconds
    setTimeout(() => processVotes(), 50000);
}

function votePlayer(player) {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");
    update(ref(db, `rooms/${roomCode}/votes`), { [playerName]: player }).then(() => {
        let chatRef = ref(db, "rooms/" + roomCode + "/chat");
        let newMessageRef = push(chatRef);
        set(newMessageRef, { player: "System", message: `${playerName} voted for ${player}` });
    });
}

function processVotes() {
    let roomCode = sessionStorage.getItem("roomCode");
    let roomRef = ref(db, `rooms/${roomCode}`);
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

        // Clear votes and transition to night phase
        update(roomRef, { 
            votes: {},
            phase: 'night'  // Ensure phase is set to night
        }).then(() => {
            startNightPhase();  // Explicitly start night phase
        });
    });
}

function checkWinConditions(players, roles) {
    let roomCode = sessionStorage.getItem("roomCode");
    let playerName = sessionStorage.getItem("playerName");

    // Check if Pushpa is eliminated
    let pushpaPlayer = Object.keys(roles).find(player => roles[player] === 'Pushpa');
    if (!players[pushpaPlayer]) {
        // Pushpa is eliminated, others win
        let chatRef = ref(db, "rooms/" + roomCode + "/chat");
        let newMessageRef = push(chatRef);
        set(newMessageRef, { player: "System", message: "Pushpa has been eliminated. The Syndicate wins!" });

        // Broadcast win condition to all players
        update(ref(db, `rooms/${roomCode}`), { gameOver: { winner: "Syndicate", message: "Pushpa has been eliminated. The Syndicate wins!" } });
        return;
    }

    // Check if half of the players remain
    let totalPlayers = Object.keys(players).length;
    let initialPlayerCount = Object.keys(roles).length;
    if (totalPlayers <= Math.floor(initialPlayerCount / 2)) {
        // Pushpa wins
        let chatRef = ref(db, "rooms/" + roomCode + "/chat");
        let newMessageRef = push(chatRef);
        set(newMessageRef, { player: "System", message: "Half of the players have been eliminated. Pushpa wins!" });

        // Broadcast win condition to all players
        update(ref(db, `rooms/${roomCode}`), { gameOver: { winner: "Pushpa", message: "Half of the players have been eliminated. Pushpa wins!" } });
        return;
    }
}

function showWinScreen(title, message) {
    document.getElementById("winTitle").innerText = title;
    document.getElementById("winMessage").innerText = message;
    document.getElementById("winScreen").style.display = "block";
    document.getElementById("gameContainer").style.display = "none";
    document.getElementById("lobby").style.display = "none";
}

function checkIfEliminated(player) {
    let playerName = sessionStorage.getItem("playerName");
    if (player === playerName) {
        // Current player is eliminated
        document.getElementById("gameContainer").style.display = "none";
        document.getElementById("gameOver").style.display = "block";
        document.getElementById("lobby").style.display = "none";
    }
}

// Return to home screen after elimination
document.getElementById("returnHomeBtn").addEventListener("click", function () {
    sessionStorage.clear();
    location.reload();
});

// Return to home screen after winning
document.getElementById("winReturnHomeBtn").addEventListener("click", function () {
    sessionStorage.clear();
    location.reload();
});

// Send message in chat
document.getElementById("sendMessageBtn").addEventListener("click", function () {
    let message = document.getElementById("chatInput").value;
    if (message) {
        let roomCode = sessionStorage.getItem("roomCode");
        let playerName = sessionStorage.getItem("playerName");
        let chatRef = ref(db, "rooms/" + roomCode + "/chat");
        let newMessageRef = push(chatRef);
        set(newMessageRef, { player: playerName, message: message });
        document.getElementById("chatInput").value = ""; // Clear input
    }
});

// Show popup message
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

// Check session storage and load room if exists
const roomCode = sessionStorage.getItem("roomCode");
const playerName = sessionStorage.getItem("playerName");

if (roomCode && playerName) {
    enterLobby(roomCode, playerName);
}