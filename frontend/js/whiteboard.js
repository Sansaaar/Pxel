(function () {
    const $ = id => document.getElementById(id);
    const svgNS = "http://www.w3.org/2000/svg";
    const htmlNS = "http://www.w3.org/1999/xhtml";
    const allowedTypes = new Set(["stroke", "highlighter", "line", "arrow", "rectangle", "ellipse", "text", "sticky", "image"]);
    const noteColors = new Set(["#d4af37", "#849b85", "#74839a"]);
    const workspace = $("whiteboardWorkspace");
    const listView = $("whiteboardListView");
    const editorView = $("whiteboardEditorView");
    const svg = $("whiteboardSvg");
    const world = $("whiteboardWorld");
    const objectLayer = $("whiteboardObjects");
    const selectionLayer = $("whiteboardSelection");
    const marquee = $("whiteboardMarquee");
    const stage = $("whiteboardStage");

    const state = {
        userId: null,
        ownerKey: "guest",
        cloudMode: "local",
        boards: [],
        localState: { ownerKey: "guest", boards: [], deletedIds: [] },
        currentBoard: null,
        objects: [],
        selectedIds: new Set(),
        tool: "select",
        color: "#d4af37",
        width: 3,
        zoom: 1,
        tx: 0,
        ty: 0,
        gesture: null,
        pointers: new Map(),
        spaceHeld: false,
        undo: [],
        redo: [],
        saveTimer: 0,
        dirty: false,
        renderFrame: 0,
        syncQueues: new Map(),
        textDraft: null,
        pendingConfirm: null,
        returnFocus: null,
        missingSchemaNotified: false
    };

    let databasePromise;

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function snapshotObjects(objects) {
        return objects.map(item => ({
            ...item,
            ...(Array.isArray(item.points)
                ? { points: item.points.map(point => ({ ...point })) }
                : {})
        }));
    }

    function makeId() {
        return crypto.randomUUID?.() || `wb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    function finite(value, fallback = 0) {
        return Number.isFinite(Number(value)) ? Number(value) : fallback;
    }

    function safeColor(value, fallback = "#d4af37") {
        return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
    }

    function safeImageData(value) {
        return typeof value === "string"
            && /^data:image\/(?:webp|png|jpeg|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(value);
    }

    function normalizeObject(source) {
        if (!source || !allowedTypes.has(source.type) || typeof source.id !== "string") return null;
        const item = {
            ...source,
            x: finite(source.x),
            y: finite(source.y),
            width: Math.max(1, finite(source.width, 120)),
            height: Math.max(1, finite(source.height, 80)),
            color: safeColor(source.color),
            strokeWidth: Math.max(1, Math.min(24, finite(source.strokeWidth, 3)))
        };
        if (["line", "arrow"].includes(item.type)) {
            item.x2 = finite(source.x2, item.x + item.width);
            item.y2 = finite(source.y2, item.y + item.height);
        }
        if (item.type === "stroke" || item.type === "highlighter") {
            item.points = Array.isArray(source.points)
                ? source.points.slice(0, 6000).map(point => ({ x: finite(point?.x), y: finite(point?.y) }))
                : [];
            if (item.points.length < 2) return null;
        }
        if (["text", "sticky"].includes(item.type)) {
            item.text = typeof source.text === "string" ? source.text.slice(0, 4000) : "";
            if (item.type === "sticky") item.accent = noteColors.has(source.accent) ? source.accent : "#d4af37";
        }
        if (item.type === "image") {
            if (!safeImageData(source.data)) return null;
            item.data = source.data;
            item.name = typeof source.name === "string" ? source.name.slice(0, 120) : "Board image";
        }
        return item;
    }

    function normalizeBoard(source, syncState = "pending") {
        if (!source || typeof source.id !== "string") return null;
        const rawObjects = Array.isArray(source.objects)
            ? source.objects
            : Array.isArray(source.document?.objects) ? source.document.objects : [];
        return {
            id: source.id,
            title: typeof source.title === "string" && source.title.trim()
                ? source.title.trim().slice(0, 80)
                : "Untitled whiteboard",
            objects: rawObjects.slice(0, 2000).map(normalizeObject).filter(Boolean),
            created_at: source.created_at || new Date().toISOString(),
            updated_at: source.updated_at || source.created_at || new Date().toISOString(),
            syncState: source.syncState || syncState
        };
    }

    function requestAsPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Local database request failed"));
        });
    }

    function openDatabase() {
        if (!window.indexedDB) return Promise.resolve(null);
        if (databasePromise) return databasePromise;
        databasePromise = new Promise((resolve, reject) => {
            const request = window.indexedDB.open("pixel-whiteboards", 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains("owners")) {
                    request.result.createObjectStore("owners", { keyPath: "ownerKey" });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not open local whiteboard storage"));
            request.onblocked = () => reject(new Error("Local whiteboard storage is blocked"));
        }).catch(() => null);
        return databasePromise;
    }

    function localStorageKey(ownerKey) {
        return `pixel-whiteboards-v1:${ownerKey}`;
    }

    function cleanLocalState(value, ownerKey) {
        const boards = Array.isArray(value?.boards)
            ? value.boards.map(board => normalizeBoard(board, "pending")).filter(Boolean)
            : [];
        const deletedIds = Array.isArray(value?.deletedIds)
            ? value.deletedIds.filter(id => typeof id === "string").slice(0, 500)
            : [];
        return { ownerKey, boards, deletedIds };
    }

    async function readLocalState(ownerKey) {
        const database = await openDatabase();
        if (database) {
            try {
                const transaction = database.transaction("owners", "readonly");
                const saved = await requestAsPromise(transaction.objectStore("owners").get(ownerKey));
                if (saved) return cleanLocalState(saved, ownerKey);
            } catch (error) {
                console.warn("[Pixel Whiteboard] Local database read failed; trying browser storage.", error);
            }
        }
        try {
            return cleanLocalState(JSON.parse(localStorage.getItem(localStorageKey(ownerKey)) || "{}"), ownerKey);
        } catch {
            return { ownerKey, boards: [], deletedIds: [] };
        }
    }

    async function writeLocalState(localState) {
        const record = cleanLocalState(localState, localState.ownerKey);
        const database = await openDatabase();
        if (database) {
            try {
                await new Promise((resolve, reject) => {
                    const transaction = database.transaction("owners", "readwrite");
                    transaction.objectStore("owners").put(record);
                    transaction.oncomplete = resolve;
                    transaction.onerror = () => reject(transaction.error || new Error("Local save failed"));
                    transaction.onabort = () => reject(transaction.error || new Error("Local save was interrupted"));
                });
                return;
            } catch (error) {
                console.warn("[Pixel Whiteboard] IndexedDB save failed; trying browser storage.", error);
            }
        }
        localStorage.setItem(localStorageKey(record.ownerKey), JSON.stringify(record));
    }

    async function identifyOwner() {
        try {
            const { data } = await window.supabaseClient?.auth.getUser();
            if (data?.user?.id) {
                state.userId = data.user.id;
                state.ownerKey = data.user.id;
                return;
            }
        } catch (error) {
            console.warn("[Pixel Whiteboard] Account lookup failed; using this device.", error);
        }
        state.userId = null;
        state.ownerKey = "guest";
    }

    function setSyncStatus(message, title = "") {
        for (const id of ["whiteboardSyncStatus", "whiteboardEditorStatus"]) {
            const element = $(id);
            if (!element) continue;
            element.textContent = message;
            element.title = title || message;
        }
    }

    function getPersistenceMessage() {
        if (!state.userId) return "Saved on this device";
        if (state.cloudMode === "ready") return "Saved to your Pixel account";
        if (state.cloudMode === "schema") return "Saved on this device · cloud setup needed";
        if (state.cloudMode === "offline") return "Saved on this device · sync pending";
        return "Saved on this device";
    }

    function mapRemoteBoard(row) {
        return normalizeBoard({
            id: row.id,
            title: row.title,
            document: row.document,
            created_at: row.created_at,
            updated_at: row.updated_at,
            syncState: "synced"
        }, "synced");
    }

    function remotePayload(board) {
        return {
            id: board.id,
            user_id: state.userId,
            title: board.title,
            document: { objects: board.objects },
            created_at: board.created_at,
            updated_at: board.updated_at
        };
    }

    function isMissingTable(error) {
        return error?.code === "42P01"
            || error?.code === "PGRST205"
            || /pixel_whiteboards.*(does not exist|could not find|schema cache)/i.test(error?.message || "");
    }

    async function deleteRemoteBoard(id) {
        const { error } = await window.supabaseClient
            .from("pixel_whiteboards")
            .delete()
            .eq("id", id)
            .eq("user_id", state.userId);
        if (error) throw error;
    }

    async function syncPendingBoards(remoteBoards) {
        const pendingBoards = state.localState.boards.filter(board => board.syncState === "pending");
        const remoteById = new Map(remoteBoards.map(board => [board.id, board]));
        const unsynced = [];

        for (const id of [...state.localState.deletedIds]) {
            try {
                await deleteRemoteBoard(id);
                state.localState.deletedIds = state.localState.deletedIds.filter(deletedId => deletedId !== id);
            } catch (error) {
                if (isMissingTable(error)) throw error;
                unsynced.push(id);
            }
        }

        for (const board of pendingBoards) {
            try {
                const { error } = await window.supabaseClient
                    .from("pixel_whiteboards")
                    .upsert(remotePayload(board), { onConflict: "id" });
                if (error) throw error;
                remoteById.set(board.id, { ...board, syncState: "synced" });
            } catch (error) {
                if (isMissingTable(error)) throw error;
                unsynced.push(board.id);
                remoteById.set(board.id, board);
            }
        }

        state.boards = [...remoteById.values()]
            .filter(board => !state.localState.deletedIds.includes(board.id))
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
        state.localState.boards = state.boards.map(board => ({
            ...board,
            syncState: unsynced.includes(board.id) ? "pending" : "synced"
        }));
    }

    async function loadBoards() {
        setSyncStatus("Loading whiteboards…");
        await identifyOwner();
        state.localState = await readLocalState(state.ownerKey);
        state.boards = state.localState.boards;
        state.cloudMode = state.userId ? "offline" : "local";

        if (state.userId && window.supabaseClient) {
            try {
                const { data, error } = await window.supabaseClient
                    .from("pixel_whiteboards")
                    .select("id,user_id,title,document,created_at,updated_at")
                    .eq("user_id", state.userId)
                    .order("updated_at", { ascending: false });
                if (error) throw error;

                state.cloudMode = "ready";
                await syncPendingBoards((data || []).map(mapRemoteBoard).filter(Boolean));
                await writeLocalState(state.localState);
            } catch (error) {
                state.cloudMode = isMissingTable(error) ? "schema" : "offline";
                if (state.cloudMode === "schema" && !state.missingSchemaNotified) {
                    state.missingSchemaNotified = true;
                    window.showChatToast?.("Whiteboards are saved on this device. Apply the included Supabase migration for account sync.", "info");
                }
                console.warn("[Pixel Whiteboard] Cloud sync unavailable; local boards remain available.", error);
            }
        }

        setSyncStatus(getPersistenceMessage());
        renderBoardList();
    }

    function localStateFromBoards() {
        state.localState.ownerKey = state.ownerKey;
        state.localState.boards = state.boards.map(board => ({ ...board, objects: board.objects }));
        return state.localState;
    }

    function updateBoardCache(board) {
        const index = state.boards.findIndex(item => item.id === board.id);
        if (index < 0) state.boards.unshift(board);
        else state.boards[index] = board;
    }

    function queueRemoteSave(snapshot) {
        if (!state.userId || !window.supabaseClient || state.cloudMode === "schema") return Promise.resolve(false);
        const previous = state.syncQueues.get(snapshot.id) || Promise.resolve();
        const current = previous.catch(() => {}).then(async () => {
            const { error } = await window.supabaseClient
                .from("pixel_whiteboards")
                .upsert(remotePayload(snapshot), { onConflict: "id" });
            if (error) throw error;
        });
        state.syncQueues.set(snapshot.id, current);
        return current.then(() => true);
    }

    async function saveCurrentBoard() {
        const board = state.currentBoard;
        if (!board || !state.dirty) return;
        state.dirty = false;
        board.title = (board.title || "Untitled whiteboard").slice(0, 80);
        board.objects = state.objects;
        board.updated_at = new Date().toISOString();
        board.syncState = state.userId ? "pending" : "local";
        updateBoardCache(board);

        const snapshot = clone(board);
        try {
            await writeLocalState(localStateFromBoards());
        } catch (error) {
            console.error("[Pixel Whiteboard] Could not save the local copy.", error);
            setSyncStatus("Save failed · check device storage", "The browser could not save this whiteboard locally.");
        }

        if (state.userId) {
            try {
                const saved = await queueRemoteSave(snapshot);
                if (saved && board.updated_at === snapshot.updated_at) {
                    board.syncState = "synced";
                    state.cloudMode = "ready";
                    updateBoardCache(board);
                    await writeLocalState(localStateFromBoards());
                }
            } catch (error) {
                state.cloudMode = isMissingTable(error) ? "schema" : "offline";
                console.warn("[Pixel Whiteboard] Cloud save failed; local copy retained.", error);
                if (state.cloudMode === "schema" && !state.missingSchemaNotified) {
                    state.missingSchemaNotified = true;
                    window.showChatToast?.("Whiteboards are saved on this device. Apply the included Supabase migration for account sync.", "info");
                }
            }
        }

        setSyncStatus(getPersistenceMessage());
        renderBoardList();
        if (state.dirty) scheduleSave();
    }

    function scheduleSave() {
        if (!state.currentBoard) return;
        state.dirty = true;
        state.currentBoard.objects = state.objects;
        state.currentBoard.syncState = state.userId ? "pending" : "local";
        setSyncStatus("Saving…");
        window.clearTimeout(state.saveTimer);
        state.saveTimer = window.setTimeout(saveCurrentBoard, 550);
    }

    async function flushSave() {
        window.clearTimeout(state.saveTimer);
        if (state.dirty) await saveCurrentBoard();
    }

    function formatDate(value) {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return "Recently updated";
        return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
    }

    function icon(className) {
        const element = document.createElement("i");
        element.className = className;
        element.setAttribute("aria-hidden", "true");
        return element;
    }

    function renderBoardList() {
        const container = $("whiteboardCards");
        if (!container) return;
        container.replaceChildren();
        const query = ($("whiteboardSearch")?.value || "").trim().toLowerCase();
        const boards = state.boards
            .filter(board => !query || board.title.toLowerCase().includes(query))
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

        $("whiteboardCount").textContent = `${state.boards.length} ${state.boards.length === 1 ? "board" : "boards"}`;
        if (!boards.length) {
            const empty = document.createElement("div");
            empty.className = "whiteboard-empty-state";
            empty.append(icon(query ? "fa-solid fa-magnifying-glass" : "fa-solid fa-pen-ruler"));
            const heading = document.createElement("strong");
            heading.textContent = query ? "No matching whiteboards" : "A clear canvas, ready for your ideas";
            const copy = document.createElement("p");
            copy.textContent = query
                ? "Try another title or clear your search."
                : "Sketch a thought, map a problem, or collect ideas in one place.";
            empty.append(heading, copy);
            if (!query) {
                const create = document.createElement("button");
                create.className = "wb-primary-button";
                create.type = "button";
                create.append(icon("fa-solid fa-plus"), document.createTextNode("New whiteboard"));
                create.addEventListener("click", createBoard);
                empty.append(create);
            }
            container.append(empty);
            return;
        }

        for (const board of boards) {
            const row = document.createElement("article");
            row.className = "whiteboard-card";
            const open = document.createElement("button");
            open.className = "whiteboard-card-main";
            open.type = "button";
            open.setAttribute("aria-label", `Open ${board.title}`);
            const emblem = document.createElement("span");
            emblem.className = "whiteboard-card-icon";
            emblem.append(icon("fa-regular fa-note-sticky"));
            const copy = document.createElement("span");
            copy.className = "whiteboard-card-copy";
            const title = document.createElement("strong");
            title.textContent = board.title;
            const detail = document.createElement("small");
            detail.textContent = `${board.objects.length} ${board.objects.length === 1 ? "object" : "objects"} · Edited ${formatDate(board.updated_at)}`;
            copy.append(title, detail);
            open.append(emblem, copy, icon("fa-solid fa-chevron-right"));
            open.addEventListener("click", () => openBoard(board.id));

            const remove = document.createElement("button");
            remove.className = "wb-icon-button wb-danger-button whiteboard-card-delete";
            remove.type = "button";
            remove.setAttribute("aria-label", `Delete ${board.title}`);
            remove.title = "Delete whiteboard";
            remove.append(icon("fa-regular fa-trash-can"));
            remove.addEventListener("click", () => {
                showConfirm("Delete this whiteboard?", `“${board.title}” will be permanently removed.`, "Delete", true, () => deleteBoard(board.id));
            });
            row.append(open, remove);
            container.append(row);
        }
    }

    async function createBoard() {
        await flushSave();
        const now = new Date().toISOString();
        const board = {
            id: makeId(),
            title: "Untitled whiteboard",
            objects: [],
            created_at: now,
            updated_at: now,
            syncState: state.userId ? "pending" : "local"
        };
        state.localState.deletedIds = state.localState.deletedIds.filter(id => id !== board.id);
        state.boards.unshift(board);
        state.currentBoard = board;
        state.objects = [];
        state.selectedIds.clear();
        state.undo = [];
        state.redo = [];
        state.dirty = true;
        state.zoom = 1;
        state.tx = 0;
        state.ty = 0;
        openEditorView();
        state.dirty = true;
        $("whiteboardTitle").value = board.title;
        applyTransform();
        updateHistoryButtons();
        await saveCurrentBoard();
        requestAnimationFrame(() => fitBoard());
        window.setTimeout(() => $("whiteboardTitle")?.select(), 30);
    }

    async function openBoard(id) {
        await flushSave();
        const board = state.boards.find(item => item.id === id);
        if (!board) return;
        state.currentBoard = board;
        state.objects = snapshotObjects(board.objects);
        state.selectedIds.clear();
        state.undo = [];
        state.redo = [];
        state.dirty = false;
        state.zoom = 1;
        state.tx = 0;
        state.ty = 0;
        $("whiteboardTitle").value = board.title;
        openEditorView();
        updateHistoryButtons();
        requestAnimationFrame(() => {
            fitBoard();
            svg.focus({ preventScroll: true });
        });
    }

    async function deleteBoard(id) {
        const board = state.boards.find(item => item.id === id);
        if (!board) return;
        state.boards = state.boards.filter(item => item.id !== id);
        state.localState.boards = state.localState.boards.filter(item => item.id !== id);
        if (state.userId) state.localState.deletedIds.push(id);
        if (state.currentBoard?.id === id) {
            state.currentBoard = null;
            state.objects = [];
            state.selectedIds.clear();
            openListView();
        }
        try {
            await writeLocalState(localStateFromBoards());
            if (state.userId && state.cloudMode !== "schema") {
                await deleteRemoteBoard(id);
                state.localState.deletedIds = state.localState.deletedIds.filter(item => item !== id);
                await writeLocalState(localStateFromBoards());
            }
        } catch (error) {
            state.cloudMode = isMissingTable(error) ? "schema" : "offline";
            console.warn("[Pixel Whiteboard] Delete sync queued for the next visit.", error);
        }
        setSyncStatus(getPersistenceMessage());
        renderBoardList();
    }

    function openEditorView() {
        listView.hidden = true;
        editorView.hidden = false;
        state.dirty = false;
        setSyncStatus(getPersistenceMessage());
        requestRender();
    }

    async function openListView() {
        await flushSave();
        editorView.hidden = true;
        listView.hidden = false;
        state.currentBoard = null;
        state.objects = [];
        state.selectedIds.clear();
        renderBoardList();
    }

    async function openWorkspace(options = {}) {
        if (!workspace.open) {
            state.returnFocus = options.returnFocus || document.activeElement;
            workspace.showModal();
        }
        listView.hidden = false;
        editorView.hidden = true;
        state.currentBoard = null;
        state.objects = [];
        await loadBoards();
        if (options.boardId) await openBoard(options.boardId);
        else if (options.createNew) await createBoard();
        else $("whiteboardNewBtn")?.focus({ preventScroll: true });
    }

    async function closeWorkspace() {
        if (state.textDraft) closeTextEditor(false);
        await flushSave();
        if (workspace.open) workspace.close();
        if (window.location.pathname === "/workspace/whiteboard") {
            window.history.replaceState({ pixelView: "workspace" }, "", "/workspace");
        }
    }

    async function getPixelWhiteboardRecents() {
        await identifyOwner();
        const local = await readLocalState(state.ownerKey);
        const byId = new Map();

        if (state.userId && window.supabaseClient) {
            try {
                const { data, error } = await window.supabaseClient
                    .from("pixel_whiteboards")
                    .select("id,title,created_at,updated_at")
                    .eq("user_id", state.userId)
                    .order("updated_at", { ascending: false })
                    .limit(8);
                if (error) throw error;
                for (const board of data || []) byId.set(board.id, { ...board, syncState: "synced" });
            } catch {
                // Local whiteboards remain available when cloud recents are unavailable.
            }
        }

        for (const board of local.boards) {
            if (local.deletedIds.includes(board.id)) continue;
            const remote = byId.get(board.id);
            if (!remote || board.syncState === "pending"
                || Date.parse(board.updated_at) > Date.parse(remote.updated_at)) {
                byId.set(board.id, board);
            }
        }
        for (const id of local.deletedIds) byId.delete(id);

        return [...byId.values()]
            .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at))
            .slice(0, 6)
            .map(({ id, title, created_at, updated_at }) => ({ id, title, created_at, updated_at }));
    }

    function svgElement(tag, attributes = {}) {
        const element = document.createElementNS(svgNS, tag);
        for (const [name, value] of Object.entries(attributes)) {
            if (value !== undefined && value !== null) element.setAttribute(name, String(value));
        }
        return element;
    }

    function getBounds(item) {
        if (item.type === "stroke" || item.type === "highlighter") {
            const points = item.points || [];
            if (!points.length) return { x: item.x, y: item.y, width: 1, height: 1 };
            const xs = points.map(point => point.x);
            const ys = points.map(point => point.y);
            const left = Math.min(...xs);
            const top = Math.min(...ys);
            return { x: left, y: top, width: Math.max(1, Math.max(...xs) - left), height: Math.max(1, Math.max(...ys) - top) };
        }
        if (item.type === "line" || item.type === "arrow") {
            const left = Math.min(item.x, item.x2);
            const top = Math.min(item.y, item.y2);
            return { x: left, y: top, width: Math.max(1, Math.abs(item.x2 - item.x)), height: Math.max(1, Math.abs(item.y2 - item.y)) };
        }
        return { x: item.x, y: item.y, width: Math.max(1, item.width), height: Math.max(1, item.height) };
    }

    function selectionBounds() {
        const selected = state.objects.filter(item => state.selectedIds.has(item.id));
        if (!selected.length) return null;
        const boxes = selected.map(getBounds);
        const x = Math.min(...boxes.map(box => box.x));
        const y = Math.min(...boxes.map(box => box.y));
        const right = Math.max(...boxes.map(box => box.x + box.width));
        const bottom = Math.max(...boxes.map(box => box.y + box.height));
        return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
    }

    function renderObject(item) {
        const group = svgElement("g", { "data-object-id": item.id, class: "wb-board-object" });
        const selected = state.selectedIds.has(item.id);
        group.style.cursor = state.tool === "select" ? "move" : "inherit";

        if (item.type === "stroke" || item.type === "highlighter") {
            const path = svgElement("path", {
                d: (item.points || []).map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" "),
                fill: "none",
                stroke: item.color,
                "stroke-width": item.type === "highlighter" ? item.strokeWidth * 4 : item.strokeWidth,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                opacity: item.type === "highlighter" ? ".24" : "1",
                "vector-effect": "non-scaling-stroke"
            });
            group.append(path);
        } else if (item.type === "line" || item.type === "arrow") {
            group.append(svgElement("line", {
                x1: item.x, y1: item.y, x2: item.x2, y2: item.y2,
                stroke: item.color, "stroke-width": item.strokeWidth,
                "stroke-linecap": "round", "vector-effect": "non-scaling-stroke"
            }));
            if (item.type === "arrow") {
                const angle = Math.atan2(item.y2 - item.y, item.x2 - item.x);
                const length = Math.max(10, item.strokeWidth * 4);
                const wingA = angle + Math.PI * .82;
                const wingB = angle - Math.PI * .82;
                group.append(svgElement("path", {
                    d: `M${item.x2 + Math.cos(wingA) * length} ${item.y2 + Math.sin(wingA) * length} L${item.x2} ${item.y2} L${item.x2 + Math.cos(wingB) * length} ${item.y2 + Math.sin(wingB) * length}`,
                    fill: "none", stroke: item.color, "stroke-width": item.strokeWidth,
                    "stroke-linecap": "round", "stroke-linejoin": "round", "vector-effect": "non-scaling-stroke"
                }));
            }
            group.append(svgElement("line", {
                x1: item.x, y1: item.y, x2: item.x2, y2: item.y2,
                stroke: "transparent", "stroke-width": Math.max(14, item.strokeWidth * 3), "pointer-events": "stroke"
            }));
        } else if (item.type === "rectangle" || item.type === "ellipse") {
            const shape = item.type === "rectangle"
                ? svgElement("rect", { x: item.x, y: item.y, width: item.width, height: item.height, rx: 3 })
                : svgElement("ellipse", { cx: item.x + item.width / 2, cy: item.y + item.height / 2, rx: item.width / 2, ry: item.height / 2 });
            shape.setAttribute("fill", "rgba(255,255,255,.008)");
            shape.setAttribute("stroke", item.color);
            shape.setAttribute("stroke-width", item.strokeWidth);
            shape.setAttribute("vector-effect", "non-scaling-stroke");
            group.append(shape);
        } else if (item.type === "text") {
            const foreign = svgElement("foreignObject", { x: item.x, y: item.y, width: item.width, height: item.height });
            const content = document.createElementNS(htmlNS, "div");
            content.className = "wb-object-text";
            content.style.color = item.color;
            content.textContent = item.text || "Double-click to edit";
            foreign.append(content);
            group.append(foreign);
        } else if (item.type === "sticky") {
            group.append(svgElement("rect", {
                x: item.x, y: item.y, width: item.width, height: item.height, rx: 5,
                fill: item.accent, "fill-opacity": ".14", stroke: item.accent,
                "stroke-opacity": ".43", "stroke-width": 1, "vector-effect": "non-scaling-stroke"
            }));
            group.append(svgElement("rect", {
                x: item.x, y: item.y, width: item.width, height: 4, rx: 2,
                fill: item.accent, "fill-opacity": ".82"
            }));
            const foreign = svgElement("foreignObject", { x: item.x, y: item.y, width: item.width, height: item.height });
            const content = document.createElementNS(htmlNS, "div");
            content.className = "wb-object-text sticky-object-text";
            content.textContent = item.text || "Double-click to edit";
            foreign.append(content);
            group.append(foreign);
        } else if (item.type === "image") {
            group.append(svgElement("rect", {
                x: item.x, y: item.y, width: item.width, height: item.height,
                fill: "rgba(255,255,255,.02)", stroke: selected ? "#d4af37" : "rgba(255,255,255,.14)",
                "stroke-width": 1, "vector-effect": "non-scaling-stroke"
            }));
            const image = svgElement("image", {
                x: item.x + 1, y: item.y + 1, width: Math.max(1, item.width - 2), height: Math.max(1, item.height - 2),
                preserveAspectRatio: "xMidYMid meet", href: item.data
            });
            image.setAttribute("pointer-events", "none");
            group.append(image);
        }
        return group;
    }

    function renderSelection() {
        selectionLayer.replaceChildren();
        const bounds = selectionBounds();
        if (!bounds) return;
        selectionLayer.append(svgElement("rect", {
            x: bounds.x - 3, y: bounds.y - 3, width: bounds.width + 6, height: bounds.height + 6,
            rx: 2, class: "wb-selection-outline"
        }));
        const handle = svgElement("circle", {
            cx: bounds.x + bounds.width + 3, cy: bounds.y + bounds.height + 3,
            r: 6 / state.zoom, class: "wb-selection-handle", "data-wb-resize": "se"
        });
        selectionLayer.append(handle);
    }

    function render() {
        if (!world) return;
        world.setAttribute("transform", `translate(${state.tx} ${state.ty}) scale(${state.zoom})`);
        objectLayer.replaceChildren(...state.objects.map(renderObject));
        renderSelection();
        $("whiteboardZoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;
        svg.className.baseVal = `whiteboard-svg tool-${state.tool}${state.gesture?.type === "pan" ? " is-panning" : ""}`;
    }

    function requestRender() {
        if (state.renderFrame) return;
        state.renderFrame = requestAnimationFrame(() => {
            state.renderFrame = 0;
            render();
        });
    }

    function applyTransform() {
        world?.setAttribute("transform", `translate(${state.tx} ${state.ty}) scale(${state.zoom})`);
        $("whiteboardZoomLabel").textContent = `${Math.round(state.zoom * 100)}%`;
    }

    function updateHistoryButtons() {
        $("whiteboardUndoBtn").disabled = state.undo.length === 0;
        $("whiteboardRedoBtn").disabled = state.redo.length === 0;
    }

    function markChanged() {
        if (!state.currentBoard) return;
        scheduleSave();
    }

    function commitMutation(before) {
        if (!before || JSON.stringify(before) === JSON.stringify(state.objects)) return;
        state.undo.push(before);
        if (state.undo.length > 80) state.undo.shift();
        state.redo = [];
        updateHistoryButtons();
        markChanged();
        requestRender();
    }

    function undo() {
        if (!state.undo.length) return;
        state.redo.push(snapshotObjects(state.objects));
        state.objects = state.undo.pop();
        state.selectedIds = new Set([...state.selectedIds].filter(id => state.objects.some(item => item.id === id)));
        updateHistoryButtons();
        markChanged();
        requestRender();
    }

    function redo() {
        if (!state.redo.length) return;
        state.undo.push(snapshotObjects(state.objects));
        state.objects = state.redo.pop();
        state.selectedIds = new Set([...state.selectedIds].filter(id => state.objects.some(item => item.id === id)));
        updateHistoryButtons();
        markChanged();
        requestRender();
    }

    function deleteSelection() {
        if (!state.selectedIds.size) return;
        const before = snapshotObjects(state.objects);
        state.objects = state.objects.filter(item => !state.selectedIds.has(item.id));
        state.selectedIds.clear();
        commitMutation(before);
    }

    function setTool(tool) {
        if (!tool) return;
        state.tool = tool;
        document.querySelectorAll(".wb-tool-button[data-tool]").forEach(button => {
            const active = button.dataset.tool === tool;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });
        svg?.focus({ preventScroll: true });
        requestRender();
    }

    function stagePoint(event) {
        const rect = svg.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function worldPoint(event) {
        const point = stagePoint(event);
        return { x: (point.x - state.tx) / state.zoom, y: (point.y - state.ty) / state.zoom };
    }

    function zoomAt(point, factor) {
        const next = Math.max(.16, Math.min(4, state.zoom * factor));
        if (next === state.zoom) return;
        const ratio = next / state.zoom;
        state.tx = point.x - (point.x - state.tx) * ratio;
        state.ty = point.y - (point.y - state.ty) * ratio;
        state.zoom = next;
        applyTransform();
        renderSelection();
    }

    function fitBoard() {
        const rect = svg.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const bounds = state.objects.length
            ? selectionBoundsFor(state.objects)
            : null;
        if (!bounds) {
            state.zoom = 1;
            state.tx = rect.width / 2;
            state.ty = rect.height / 2;
            applyTransform();
            return;
        }
        const margin = 100;
        const zoom = Math.max(.16, Math.min(2.5,
            Math.min((rect.width - margin * 2) / Math.max(120, bounds.width),
                (rect.height - margin * 2) / Math.max(100, bounds.height))));
        state.zoom = zoom;
        state.tx = (rect.width - bounds.width * zoom) / 2 - bounds.x * zoom;
        state.ty = (rect.height - bounds.height * zoom) / 2 - bounds.y * zoom;
        applyTransform();
        renderSelection();
    }

    function selectionBoundsFor(objects) {
        if (!objects.length) return null;
        const boxes = objects.map(getBounds);
        const x = Math.min(...boxes.map(box => box.x));
        const y = Math.min(...boxes.map(box => box.y));
        const right = Math.max(...boxes.map(box => box.x + box.width));
        const bottom = Math.max(...boxes.map(box => box.y + box.height));
        return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
    }

    function translateObject(item, dx, dy) {
        const moved = { ...item, x: item.x + dx, y: item.y + dy };
        if (Number.isFinite(item.x2)) moved.x2 = item.x2 + dx;
        if (Number.isFinite(item.y2)) moved.y2 = item.y2 + dy;
        if (Array.isArray(item.points)) moved.points = item.points.map(point => ({ x: point.x + dx, y: point.y + dy }));
        return moved;
    }

    function scaleObject(item, bounds, sx, sy) {
        const scaled = { ...item };
        const scaleX = x => bounds.x + (x - bounds.x) * sx;
        const scaleY = y => bounds.y + (y - bounds.y) * sy;
        scaled.x = scaleX(item.x);
        scaled.y = scaleY(item.y);
        if (Number.isFinite(item.x2)) scaled.x2 = scaleX(item.x2);
        if (Number.isFinite(item.y2)) scaled.y2 = scaleY(item.y2);
        if (Number.isFinite(item.width)) scaled.width = Math.max(30, item.width * sx);
        if (Number.isFinite(item.height)) scaled.height = Math.max(24, item.height * sy);
        if (Array.isArray(item.points)) scaled.points = item.points.map(point => ({ x: scaleX(point.x), y: scaleY(point.y) }));
        return scaled;
    }

    function updateDrawing(item, point) {
        if (item.type === "stroke" || item.type === "highlighter") {
            const last = item.points[item.points.length - 1];
            if (Math.hypot(point.x - last.x, point.y - last.y) >= 1.5 / state.zoom) item.points.push(point);
        } else if (item.type === "line" || item.type === "arrow") {
            item.x2 = point.x;
            item.y2 = point.y;
        } else {
            const start = state.gesture.start;
            item.x = Math.min(start.x, point.x);
            item.y = Math.min(start.y, point.y);
            item.width = Math.abs(point.x - start.x);
            item.height = Math.abs(point.y - start.y);
        }
    }

    function hitTest(point) {
        const radius = 14 / state.zoom;
        for (let index = state.objects.length - 1; index >= 0; index--) {
            const item = state.objects[index];
            const box = getBounds(item);
            if (point.x >= box.x - radius && point.x <= box.x + box.width + radius
                && point.y >= box.y - radius && point.y <= box.y + box.height + radius) return item;
        }
        return null;
    }

    function eraseAt(point) {
        const radius = 18 / state.zoom;
        const removed = state.objects.filter(item => {
            const box = getBounds(item);
            return point.x >= box.x - radius && point.x <= box.x + box.width + radius
                && point.y >= box.y - radius && point.y <= box.y + box.height + radius;
        });
        if (!removed.length) return;
        const ids = new Set(removed.map(item => item.id));
        state.gesture.changed = true;
        state.objects = state.objects.filter(item => !ids.has(item.id));
        for (const id of ids) state.selectedIds.delete(id);
        requestRender();
    }

    function beginTextObject(type, point) {
        const before = snapshotObjects(state.objects);
        const originalSelection = [...state.selectedIds];
        const item = {
            id: makeId(), type, x: point.x, y: point.y,
            width: type === "sticky" ? 210 : 250,
            height: type === "sticky" ? 150 : 72,
            text: "", color: state.color, accent: "#d4af37", strokeWidth: state.width
        };
        state.objects.push(item);
        state.selectedIds = new Set([item.id]);
        showTextEditor(item, true, before, originalSelection);
        setTool("select");
        requestRender();
    }

    function showTextEditor(item, isNew = false, before = null, originalSelection = []) {
        state.textDraft = { id: item.id, isNew, before, originalSelection };
        $("whiteboardTextHeading").textContent = item.type === "sticky" ? "Edit sticky note" : "Edit text";
        $("whiteboardTextInput").value = item.text || "";
        $("whiteboardNoteColors").hidden = item.type !== "sticky";
        const colorChoice = document.querySelector(`input[name="whiteboardNoteColor"][value="${safeColor(item.accent)}"]`);
        if (colorChoice) colorChoice.checked = true;
        $("whiteboardTextLayer").hidden = false;
        $("whiteboardTextInput").focus();
    }

    function closeTextEditor(save) {
        const draft = state.textDraft;
        if (!draft) return;
        const item = state.objects.find(object => object.id === draft.id);
        if (save && item) {
            item.text = $("whiteboardTextInput").value.slice(0, 4000);
            if (item.type === "sticky") {
                item.accent = document.querySelector('input[name="whiteboardNoteColor"]:checked')?.value || "#d4af37";
            }
            if (!item.text.trim()) {
                state.objects = state.objects.filter(object => object.id !== item.id);
                state.selectedIds.delete(item.id);
            }
            commitMutation(draft.before || []);
        } else if (draft.isNew) {
            state.objects = draft.before || state.objects.filter(object => object.id !== draft.id);
            state.selectedIds = new Set(draft.originalSelection);
        }
        state.textDraft = null;
        $("whiteboardTextLayer").hidden = true;
        requestRender();
        svg?.focus({ preventScroll: true });
    }

    function pointerDown(event) {
        if (!state.currentBoard) return;
        if (event.pointerType === "mouse" && event.button === 2) event.preventDefault();
        state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
        try { svg.setPointerCapture(event.pointerId); } catch {}

        const touchPoints = [...state.pointers.values()].filter(pointer => pointer.type === "touch");
        if (event.pointerType === "touch" && touchPoints.length >= 2) {
            if (state.gesture) finishGesture();
            const rect = svg.getBoundingClientRect();
            const midpoint = {
                x: (touchPoints[0].x + touchPoints[1].x) / 2 - rect.left,
                y: (touchPoints[0].y + touchPoints[1].y) / 2 - rect.top
            };
            state.gesture = {
                type: "pinch",
                baseDistance: Math.max(1, Math.hypot(touchPoints[0].x - touchPoints[1].x, touchPoints[0].y - touchPoints[1].y)),
                baseZoom: state.zoom,
                anchor: { x: (midpoint.x - state.tx) / state.zoom, y: (midpoint.y - state.ty) / state.zoom }
            };
            event.preventDefault();
            return;
        }
        if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;

        const point = worldPoint(event);
        const screen = stagePoint(event);
        const forcePan = state.spaceHeld || state.tool === "hand" || event.button === 1 || event.button === 2;
        if (forcePan) {
            state.gesture = { type: "pan", screen, tx: state.tx, ty: state.ty };
            svg.classList.add("is-panning");
            event.preventDefault();
            return;
        }

        if (state.tool === "select") {
            const resizeHandle = event.target.closest?.("[data-wb-resize]");
            if (resizeHandle) {
                const bounds = selectionBounds();
                state.gesture = { type: "resize", start: point, bounds, before: snapshotObjects(state.objects), ids: new Set(state.selectedIds) };
                event.preventDefault();
                return;
            }
            const object = event.target.closest?.("[data-object-id]");
            if (object) {
                const id = object.dataset.objectId;
                if (event.shiftKey) {
                    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
                    else state.selectedIds.add(id);
                } else if (!state.selectedIds.has(id)) {
                    state.selectedIds = new Set([id]);
                }
                requestRender();
                if (!state.selectedIds.has(id)) return;
                state.gesture = { type: "move", start: point, before: snapshotObjects(state.objects), ids: new Set(state.selectedIds) };
                event.preventDefault();
                return;
            }
            if (!event.shiftKey) state.selectedIds.clear();
            state.gesture = {
                type: "marquee", start: point, end: point,
                initial: event.shiftKey ? new Set(state.selectedIds) : new Set()
            };
            marquee.hidden = false;
            requestRender();
            event.preventDefault();
            return;
        }

        if (state.tool === "text" || state.tool === "sticky") {
            beginTextObject(state.tool, point);
            event.preventDefault();
            return;
        }

        if (state.tool === "eraser") {
            state.gesture = { type: "erase", before: snapshotObjects(state.objects), changed: false };
            eraseAt(point);
            event.preventDefault();
            return;
        }

        const type = ["pen", "highlighter"].includes(state.tool)
            ? state.tool === "pen" ? "stroke" : "highlighter"
            : state.tool;
        const item = {
            id: makeId(), type, x: point.x, y: point.y, x2: point.x, y2: point.y,
            width: 0, height: 0, color: state.color, strokeWidth: state.width
        };
        if (type === "stroke" || type === "highlighter") item.points = [point];
        const before = snapshotObjects(state.objects);
        state.objects.push(item);
        state.selectedIds.clear();
        state.gesture = { type: "draw", itemId: item.id, start: point, before };
        requestRender();
        event.preventDefault();
    }

    function pointerMove(event) {
        if (state.pointers.has(event.pointerId)) {
            state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType });
        }
        const gesture = state.gesture;
        if (!gesture) return;

        if (gesture.type === "pinch") {
            const points = [...state.pointers.values()].filter(pointer => pointer.type === "touch");
            if (points.length < 2) return;
            const rect = svg.getBoundingClientRect();
            const midpoint = { x: (points[0].x + points[1].x) / 2 - rect.left, y: (points[0].y + points[1].y) / 2 - rect.top };
            const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
            state.zoom = Math.max(.16, Math.min(4, gesture.baseZoom * distance / gesture.baseDistance));
            state.tx = midpoint.x - gesture.anchor.x * state.zoom;
            state.ty = midpoint.y - gesture.anchor.y * state.zoom;
            applyTransform();
            return;
        }

        const screen = stagePoint(event);
        const point = worldPoint(event);
        if (gesture.type === "pan") {
            state.tx = gesture.tx + screen.x - gesture.screen.x;
            state.ty = gesture.ty + screen.y - gesture.screen.y;
            applyTransform();
        } else if (gesture.type === "draw") {
            const item = state.objects.find(object => object.id === gesture.itemId);
            if (item) updateDrawing(item, point);
            requestRender();
        } else if (gesture.type === "move") {
            const dx = point.x - gesture.start.x;
            const dy = point.y - gesture.start.y;
            state.objects = gesture.before.map(item => gesture.ids.has(item.id) ? translateObject(item, dx, dy) : item);
            requestRender();
        } else if (gesture.type === "resize") {
            const sx = Math.max(.08, (gesture.bounds.width + point.x - gesture.start.x) / Math.max(1, gesture.bounds.width));
            const sy = Math.max(.08, (gesture.bounds.height + point.y - gesture.start.y) / Math.max(1, gesture.bounds.height));
            state.objects = gesture.before.map(item => gesture.ids.has(item.id) ? scaleObject(item, gesture.bounds, sx, sy) : item);
            requestRender();
        } else if (gesture.type === "erase") {
            eraseAt(point);
        } else if (gesture.type === "marquee") {
            gesture.end = point;
            const x = Math.min(gesture.start.x, point.x);
            const y = Math.min(gesture.start.y, point.y);
            marquee.setAttribute("x", x);
            marquee.setAttribute("y", y);
            marquee.setAttribute("width", Math.abs(point.x - gesture.start.x));
            marquee.setAttribute("height", Math.abs(point.y - gesture.start.y));
        }
        event.preventDefault();
    }

    function finishGesture() {
        const gesture = state.gesture;
        if (!gesture) return;
        state.gesture = null;
        marquee.hidden = true;
        svg?.classList.remove("is-panning");

        if (gesture.type === "draw") {
            const item = state.objects.find(object => object.id === gesture.itemId);
            if (!item) return;
            const shapeSize = ["line", "arrow"].includes(item.type)
                ? Math.hypot(item.x2 - item.x, item.y2 - item.y)
                : Math.hypot(item.width, item.height);
            if (["line", "arrow", "rectangle", "ellipse"].includes(item.type)
                && shapeSize < 3 / state.zoom) {
                state.objects = state.objects.filter(object => object.id !== item.id);
                requestRender();
                return;
            }
            state.selectedIds = new Set([item.id]);
            commitMutation(gesture.before);
        } else if (gesture.type === "move" || gesture.type === "resize") {
            commitMutation(gesture.before);
        } else if (gesture.type === "erase" && gesture.changed) {
            commitMutation(gesture.before);
        } else if (gesture.type === "marquee") {
            const left = Math.min(gesture.start.x, gesture.end.x);
            const top = Math.min(gesture.start.y, gesture.end.y);
            const right = Math.max(gesture.start.x, gesture.end.x);
            const bottom = Math.max(gesture.start.y, gesture.end.y);
            const hits = state.objects.filter(item => {
                const box = getBounds(item);
                return box.x <= right && box.x + box.width >= left && box.y <= bottom && box.y + box.height >= top;
            }).map(item => item.id);
            state.selectedIds = new Set([...gesture.initial, ...hits]);
        }
        requestRender();
    }

    function pointerUp(event) {
        const wasPinching = state.gesture?.type === "pinch";
        state.pointers.delete(event.pointerId);
        if (wasPinching) {
            const remaining = [...state.pointers.values()].find(pointer => pointer.type === "touch");
            if (remaining) {
                const rect = svg.getBoundingClientRect();
                state.gesture = {
                    type: "pan",
                    screen: { x: remaining.x - rect.left, y: remaining.y - rect.top },
                    tx: state.tx, ty: state.ty
                };
            } else {
                state.gesture = null;
            }
            return;
        }
        finishGesture();
    }

    function showConfirm(heading, copy, actionLabel, danger, action) {
        $("whiteboardConfirmHeading").textContent = heading;
        $("whiteboardConfirmCopy").textContent = copy;
        const button = $("whiteboardConfirmAction");
        button.textContent = actionLabel;
        button.classList.toggle("wb-confirm-danger", danger);
        state.pendingConfirm = action;
        $("whiteboardConfirmLayer").hidden = false;
        button.focus();
    }

    function closeInnerLayer(layer) {
        if (layer === $("whiteboardTextLayer")) closeTextEditor(false);
        else layer.hidden = true;
        if (layer === $("whiteboardConfirmLayer")) state.pendingConfirm = null;
        svg?.focus({ preventScroll: true });
    }

    function bytesFromDataUrl(data) {
        const encoded = data.split(",", 2)[1] || "";
        return Math.floor(encoded.length * 3 / 4);
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error("Could not read image"));
            reader.readAsDataURL(blob);
        });
    }

    async function compressImage(file) {
        if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
            throw new Error("Choose an image smaller than 15 MB.");
        }
        let bitmap;
        try {
            bitmap = await createImageBitmap(file);
            const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .82));
            if (!blob) throw new Error("This image could not be prepared.");
            if (blob.size > 3 * 1024 * 1024) throw new Error("This image is still too large after compression.");
            return { data: await blobToDataUrl(blob), width: canvas.width, height: canvas.height, type: blob.type };
        } finally {
            bitmap?.close?.();
        }
    }

    async function insertImageFiles(fileList, origin) {
        const files = [...(fileList || [])].slice(0, 12);
        if (!files.length || !state.currentBoard) return;
        const point = origin || { x: (svg.clientWidth / 2 - state.tx) / state.zoom, y: (svg.clientHeight / 2 - state.ty) / state.zoom };
        const before = snapshotObjects(state.objects);
        let added = 0;
        for (const [index, file] of files.entries()) {
            try {
                const image = await compressImage(file);
                const scale = Math.min(1, 440 / image.width, 340 / image.height);
                const width = Math.max(40, image.width * scale);
                const height = Math.max(40, image.height * scale);
                const offset = added * 24;
                state.objects.push({
                    id: makeId(), type: "image", x: point.x + offset, y: point.y + offset,
                    width, height, data: image.data, name: file.name || `Board image ${index + 1}`,
                    sourceType: image.type, color: state.color, strokeWidth: 1
                });
                added++;
            } catch (error) {
                window.showChatToast?.(`${file.name || "Image"}: ${error.message}`, "error");
            }
        }
        if (added) {
            state.selectedIds = new Set(state.objects.slice(-added).map(item => item.id));
            commitMutation(before);
        }
    }

    function describeObject(item) {
        const box = getBounds(item);
        const base = { type: item.type, x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
        if (item.type === "text" || item.type === "sticky") base.text = item.text;
        if (item.type === "image") base.image = item.name;
        if (item.type === "stroke" || item.type === "highlighter") {
            const step = Math.max(1, Math.ceil(item.points.length / 90));
            base.points = item.points.filter((_, index) => index % step === 0).map(point => [Math.round(point.x), Math.round(point.y)]);
        }
        if (item.type === "line" || item.type === "arrow") base.to = [Math.round(item.x2), Math.round(item.y2)];
        return base;
    }

    function askPixel() {
        const selected = state.objects.filter(item => state.selectedIds.has(item.id));
        const contextObjects = selected.length ? selected : state.objects;
        $("whiteboardAskContext").textContent = selected.length
            ? `Pixel will receive ${selected.length} selected ${selected.length === 1 ? "object" : "objects"} from “${state.currentBoard.title}”.`
            : `Nothing is selected, so Pixel will receive all ${state.objects.length} board ${state.objects.length === 1 ? "object" : "objects"}.`;
        $("whiteboardAskLayer").hidden = false;
        $("whiteboardAskInput").value = "";
        $("whiteboardAskInput").focus();
        state.askObjects = contextObjects.map(item => ({ ...item }));
    }

    async function sendBoardToPixel() {
        const button = $("whiteboardAskSendBtn");
        const promptInput = $("promptInput");
        if (!state.currentBoard || !promptInput || typeof window.sendMessage !== "function") {
            window.showChatToast?.("Pixel chat is not ready. Close this dialog and try again.", "error");
            return;
        }
        const objects = state.askObjects || [];
        const mode = $("whiteboardAskMode").value;
        const extra = $("whiteboardAskInput").value.trim();
        const draft = promptInput.value.trim();
        const structured = JSON.stringify(objects.map(describeObject));
        const boardContext = structured.length > 12000 ? `${structured.slice(0, 11970)}… [content shortened]` : structured;
        let message = `${mode}\n\nWhiteboard: ${state.currentBoard.title}\nSelected board content (structured):\n${boardContext}`;
        if (extra) message += `\n\nAdditional request: ${extra}`;
        if (draft) message += `\n\nText already in the chat composer:\n${draft}`;

        const existing = window.getUploadedAttachments?.() || [];
        const boardImages = objects.filter(item => item.type === "image").map(item => ({
            name: item.name || "whiteboard-image.webp",
            type: item.sourceType || "image/webp",
            size: bytesFromDataUrl(item.data),
            data: item.data,
            content: null,
            isImage: true
        }));
        const attachments = [...existing, ...boardImages].slice(0, 4);
        let totalBytes = attachments.reduce((sum, item) => sum + finite(item.size), 0);
        while (totalBytes > 5 * 1024 * 1024 && attachments.length > existing.length) {
            totalBytes -= finite(attachments.pop()?.size);
        }
        if (attachments.length < existing.length + boardImages.length) {
            window.showChatToast?.("Pixel can attach up to four files or 5 MB per message; some board images were left out.", "info");
        }

        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Preparing…';
        $("whiteboardAskLayer").hidden = true;
        await closeWorkspace();
        window.switchAppView?.("aiChat");
        promptInput.value = message;
        promptInput.style.height = "auto";
        promptInput.style.height = `${Math.min(promptInput.scrollHeight, 200)}px`;
        try {
            await window.sendMessage({ attachments });
        } catch (error) {
            console.error("[Pixel Whiteboard] Could not send board context to chat.", error);
            promptInput.value = message;
            window.showChatToast?.("The board is ready in chat, but the message could not be sent. Try again there.", "error");
        }
        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-arrow-up" aria-hidden="true"></i> Send to chat';
        state.askObjects = null;
    }

    function handleKeys(event) {
        if (!workspace.open) return;
        const visibleLayer = [$("whiteboardTextLayer"), $("whiteboardAskLayer"), $("whiteboardConfirmLayer")]
            .find(layer => !layer.hidden);
        if (event.key === "Escape") {
            if (visibleLayer) {
                closeInnerLayer(visibleLayer);
            } else {
                closeWorkspace();
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }
        if (event.key === "Tab" && visibleLayer) {
            const focusable = [...visibleLayer.querySelectorAll(
                'button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), a[href]'
            )];
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (first && (event.shiftKey && document.activeElement === first
                || !event.shiftKey && document.activeElement === last
                || !visibleLayer.contains(document.activeElement))) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
            return;
        }

        const target = event.target;
        const editing = target.matches?.("input,textarea,select,[contenteditable='true']");
        if (editing) return;

        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && event.key.toLowerCase() === "z") {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.shiftKey) redo();
            else undo();
            return;
        }
        if (modifier && ["b", "k", "c", ","].includes(event.key.toLowerCase())) {
            event.stopImmediatePropagation();
            return;
        }
        if (event.key === " ") {
            state.spaceHeld = true;
            event.preventDefault();
            return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
            if (state.selectedIds.size) {
                event.preventDefault();
                deleteSelection();
            }
            return;
        }
        const shortcutTools = { v: "select", p: "pen", e: "eraser", t: "text", h: "hand" };
        const tool = shortcutTools[event.key.toLowerCase()];
        if (tool && !event.altKey && !modifier) {
            event.preventDefault();
            setTool(tool);
        }
    }

    function initialize() {
        if (!workspace || !svg) return;
        $("whiteboardBtn")?.addEventListener("click", openWorkspace);
        $("whiteboardCloseBtn")?.addEventListener("click", closeWorkspace);
        $("whiteboardEditorCloseBtn")?.addEventListener("click", closeWorkspace);
        $("whiteboardBackBtn")?.addEventListener("click", openListView);
        $("whiteboardNewBtn")?.addEventListener("click", createBoard);
        $("whiteboardSearch")?.addEventListener("input", renderBoardList);
        $("whiteboardAskBtn")?.addEventListener("click", askPixel);
        $("whiteboardAskSendBtn")?.addEventListener("click", sendBoardToPixel);
        $("whiteboardTextSaveBtn")?.addEventListener("click", () => closeTextEditor(true));
        $("whiteboardConfirmAction")?.addEventListener("click", () => {
            const action = state.pendingConfirm;
            state.pendingConfirm = null;
            $("whiteboardConfirmLayer").hidden = true;
            action?.();
        });

        workspace.addEventListener("click", event => {
            const closeButton = event.target.closest?.("[data-wb-close-dialog]");
            if (closeButton) {
                const layer = closeButton.closest(".wb-dialog-layer");
                if (layer) closeInnerLayer(layer);
                return;
            }
            if (event.target === $("whiteboardTextLayer")) closeTextEditor(false);
            if (event.target === $("whiteboardAskLayer")) $("whiteboardAskLayer").hidden = true;
            if (event.target === $("whiteboardConfirmLayer")) closeInnerLayer($("whiteboardConfirmLayer"));
            if (event.target === workspace) closeWorkspace();
        });
        workspace.addEventListener("close", () => {
            listView.hidden = false;
            editorView.hidden = true;
            state.currentBoard = null;
            state.objects = [];
            state.selectedIds.clear();
            if (state.returnFocus?.isConnected) state.returnFocus.focus({ preventScroll: true });
        });

        document.querySelectorAll(".wb-tool-button[data-tool]").forEach(button => {
            button.addEventListener("click", () => setTool(button.dataset.tool));
        });
        $("whiteboardColor").addEventListener("input", event => { state.color = safeColor(event.target.value); });
        $("whiteboardWidth").addEventListener("input", event => { state.width = finite(event.target.value, 3); });
        $("whiteboardUndoBtn").addEventListener("click", undo);
        $("whiteboardRedoBtn").addEventListener("click", redo);
        $("whiteboardClearBtn").addEventListener("click", () => {
            if (!state.objects.length) return;
            showConfirm("Clear this canvas?", "All objects on this board will be removed. You can undo this action.", "Clear canvas", true, () => {
                const before = snapshotObjects(state.objects);
                state.objects = [];
                state.selectedIds.clear();
                commitMutation(before);
            });
        });
        $("whiteboardDeleteBtn").addEventListener("click", () => {
            if (!state.currentBoard) return;
            showConfirm("Delete this whiteboard?", `“${state.currentBoard.title}” will be permanently removed.`, "Delete", true, () => deleteBoard(state.currentBoard.id));
        });
        $("whiteboardZoomIn").addEventListener("click", () => zoomAt({ x: svg.clientWidth / 2, y: svg.clientHeight / 2 }, 1.2));
        $("whiteboardZoomOut").addEventListener("click", () => zoomAt({ x: svg.clientWidth / 2, y: svg.clientHeight / 2 }, 1 / 1.2));
        $("whiteboardZoomLabel").addEventListener("click", () => {
            zoomAt({ x: svg.clientWidth / 2, y: svg.clientHeight / 2 }, 1 / state.zoom);
        });
        $("whiteboardFitBtn").addEventListener("click", fitBoard);
        $("whiteboardImageBtn").addEventListener("click", () => $("whiteboardImageInput").click());
        $("whiteboardImageInput").addEventListener("change", event => {
            insertImageFiles(event.target.files);
            event.target.value = "";
        });
        $("whiteboardTitle").addEventListener("input", event => {
            if (!state.currentBoard) return;
            state.currentBoard.title = event.target.value.slice(0, 80) || "Untitled whiteboard";
            scheduleSave();
        });
        $("whiteboardTitle").addEventListener("blur", event => {
            if (!state.currentBoard) return;
            state.currentBoard.title = event.target.value.trim().slice(0, 80) || "Untitled whiteboard";
            event.target.value = state.currentBoard.title;
            scheduleSave();
        });

        svg.addEventListener("pointerdown", pointerDown);
        svg.addEventListener("pointermove", pointerMove);
        svg.addEventListener("pointerup", pointerUp);
        svg.addEventListener("pointercancel", pointerUp);
        svg.addEventListener("lostpointercapture", pointerUp);
        svg.addEventListener("dblclick", event => {
            const object = event.target.closest?.("[data-object-id]");
            const item = object && state.objects.find(candidate => candidate.id === object.dataset.objectId);
            if (item && (item.type === "text" || item.type === "sticky")) {
                showTextEditor(item);
                event.preventDefault();
            }
        });
        svg.addEventListener("wheel", event => {
            event.preventDefault();
            const point = stagePoint(event);
            if (event.ctrlKey || event.metaKey) {
                zoomAt(point, Math.exp(-event.deltaY * .0015));
            } else {
                state.tx -= event.deltaX;
                state.ty -= event.deltaY;
                applyTransform();
            }
        }, { passive: false });
        svg.addEventListener("contextmenu", event => event.preventDefault());

        stage.addEventListener("dragenter", event => {
            if (!event.dataTransfer?.types?.includes("Files")) return;
            event.preventDefault();
            event.stopPropagation();
            $("whiteboardDropHint").hidden = false;
        });
        stage.addEventListener("dragover", event => {
            event.preventDefault();
            event.stopPropagation();
            if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
            $("whiteboardDropHint").hidden = false;
        });
        stage.addEventListener("dragleave", event => {
            if (!stage.contains(event.relatedTarget)) $("whiteboardDropHint").hidden = true;
        });
        stage.addEventListener("drop", event => {
            event.preventDefault();
            event.stopPropagation();
            $("whiteboardDropHint").hidden = true;
            const point = worldPoint(event);
            insertImageFiles(event.dataTransfer?.files, point);
        });

        document.addEventListener("keydown", handleKeys, true);
        document.addEventListener("keyup", event => {
            if (event.key === " ") {
                state.spaceHeld = false;
                if (!state.gesture) svg.classList.remove("is-panning");
            }
        }, true);
        window.addEventListener("blur", () => { state.spaceHeld = false; });
        window.addEventListener("resize", () => { if (workspace.open) requestRender(); });
        window.addEventListener("popstate", () => {
            if (window.location.pathname === "/workspace/whiteboard" && !workspace.open) {
                openWorkspace();
            } else if (window.location.pathname !== "/workspace/whiteboard" && workspace.open) {
                closeWorkspace();
            }
        });

        window.openPixelWhiteboard = async (options = {}) => {
            if (options.route && window.location.pathname !== "/workspace/whiteboard") {
                window.history.pushState({ pixelView: "whiteboard" }, "", "/workspace/whiteboard");
            }
            return openWorkspace(options);
        };
        window.getPixelWhiteboardRecents = getPixelWhiteboardRecents;

        if (window.location.pathname === "/workspace/whiteboard") openWorkspace();
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
