(function(){
  var API = "https://en.wikipedia.org/w/api.php";
  var POOL = ["Pizza","Albert Einstein","Moon","Ancient Rome","Association football","Guitar","Volcano","Chocolate","Titanic","Cat","Mount Everest","Electricity","Leonardo da Vinci","Coffee","Jazz","Dinosaur","Great Pyramid of Giza","Japan","Bicycle","Great white shark","Bitcoin","Napoleon","Oxygen","Olympic Games","Vampire","Pacific Ocean","Telescope","William Shakespeare","Hamburger","Sahara","Penguin","Internet","World War II","Basketball","Chess","Rainbow","Sushi","Solar System","Wolfgang Amadeus Mozart","Amazon River","Honey","Tornado","Elephant","Brazil","Vincent van Gogh","Lightning","Bread"];
  var $ = function(id){ return document.getElementById(id); };
  var RH = window.RH;

  var MAX_PLAYERS = 8, MAX_PENDING = 4, PENDING_TTL = 60000, JOIN_WAIT = 8000, JOIN_BURST = 8, TOKEN_GAP = 2000;
  var RENAME_GAP = 10000, CHAT_GAP = 700, CHAT_BURST = 6, BEAT = 5000, DEAD = 20000, MSG_BURST = 40, MOUSE_BURST = 30;
  var REASONS = {
    locked: "That party is locked.",
    full: "That party is full.",
    inround: "A round is in progress. Try again when it ends.",
    denied: "The host declined your request.",
    kicked: "You were removed from that party.",
    busy: "That party is busy right now. Try again in a moment.",
    expired: "Your request timed out.",
    replaced: "You joined from another tab, so this one was disconnected."
  };

  var from, to, clicks = 0, path = [], acc = 0, last = 0, running = false, raf = 0, busy = false, ended = true;
  var party = null, watched = false, lastMouse = 0, lastChat = 0, lastRename = 0, joinUntil = 0;
  var spectating = false, specTarget = null, specPage = null, specSeq = 0;
  var inviteCode = "", inviteKey = "";

  var store = {
    get: function(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set: function(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  };

  var TOKEN = (function(){
    var t = null, i, a = "abcdefghijklmnopqrstuvwxyz0123456789";
    try { t = sessionStorage.getItem("rabbit-hole:token"); } catch(e){}
    if(!t || !/^[a-z0-9]{16}$/.test(t)){
      t = "";
      for(i = 0; i < 16; i++) t += a.charAt(Math.floor(Math.random() * a.length));
      try { sessionStorage.setItem("rabbit-hole:token", t); } catch(e){}
    }
    return t;
  })();

  function norm(t){ return (t || "").replace(/_/g, " ").trim().toLowerCase(); }
  function fmt(ms){
    var cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (cs < 10 ? "0" : "") + cs;
  }
  function elapsed(){ return acc + (running ? performance.now() - last : 0); }
  function tick(){ $("timer").textContent = fmt(elapsed()); raf = requestAnimationFrame(tick); }
  function startClock(){ if(!running){ last = performance.now(); running = true; } }
  function stopClock(){ if(running){ acc += performance.now() - last; running = false; } }
  function api(params){
    var q = Object.keys(params).map(function(k){ return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(API + "?" + q + "&format=json&formatversion=2&origin=*").then(function(r){ return r.json(); });
  }
  function key(){ return "rabbit-hole:" + norm(from) + ">" + norm(to); }
  function getBest(f, t){ try { var v = store.get("rabbit-hole:" + norm(f) + ">" + norm(t)); return v ? JSON.parse(v) : null; } catch(e){ return null; } }
  function setBest(o){ store.set(key(), JSON.stringify(o)); }
  function setErr(m){ $("err").textContent = m || ""; }
  function num(v, lo, hi){ return typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null; }
  function randName(){ return "Player" + (10 + Math.floor(Math.random() * 90)); }
  function setBarH(){
    var b = !$("gbar").classList.contains("hidden") ? $("gbar") : (!$("specBar").classList.contains("hidden") ? $("specBar") : null);
    document.documentElement.style.setProperty("--barh", (b ? b.offsetHeight : 0) + "px");
  }

  function suggest(input, box){
    var timer, items = [], idx = -1, seq = 0;
    function hide(){ box.classList.add("hidden"); idx = -1; }
    function paint(){
      box.innerHTML = "";
      items.forEach(function(t, i){
        var b = document.createElement("button"); b.type = "button"; b.textContent = t;
        if(i === idx) b.className = "on";
        b.addEventListener("mousedown", function(e){ e.preventDefault(); input.value = t; hide(); });
        box.appendChild(b);
      });
      box.classList.toggle("hidden", !items.length);
    }
    input.addEventListener("input", function(){
      clearTimeout(timer);
      var v = input.value.trim();
      if(v.length < 2){ items = []; hide(); return; }
      var my = ++seq;
      timer = setTimeout(function(){
        fetch(API + "?action=opensearch&namespace=0&limit=7&format=json&origin=*&search=" + encodeURIComponent(v))
          .then(function(r){ return r.json(); })
          .then(function(d){ if(my !== seq) return; items = d[1] || []; idx = -1; paint(); })
          .catch(function(){});
      }, 180);
    });
    input.addEventListener("keydown", function(e){
      if(box.classList.contains("hidden")) return;
      if(e.key === "ArrowDown"){ e.preventDefault(); idx = (idx + 1) % items.length; paint(); }
      else if(e.key === "ArrowUp"){ e.preventDefault(); idx = (idx - 1 + items.length) % items.length; paint(); }
      else if(e.key === "Enter" && idx >= 0){ e.preventDefault(); input.value = items[idx]; hide(); }
      else if(e.key === "Escape"){ hide(); }
    });
    input.addEventListener("blur", function(){ setTimeout(hide, 120); });
  }
  suggest($("fromIn"), $("fromSug"));
  suggest($("toIn"), $("toSug"));

  function updateBest(){
    var f = $("fromIn").value.trim(), t = $("toIn").value.trim();
    var b = f && t ? getBest(f, t) : null;
    $("bestLine").textContent = b ? "Your best on this route: " + fmt(b.ms) + " in " + b.clicks + " clicks" : "";
  }
  $("fromIn").addEventListener("change", updateBest);
  $("toIn").addEventListener("change", updateBest);

  function randomRoute(){
    var a = POOL[Math.floor(Math.random() * POOL.length)], b;
    do { b = POOL[Math.floor(Math.random() * POOL.length)]; } while(b === a);
    $("fromIn").value = a; $("toIn").value = b; setErr(""); updateBest();
  }

  function resolve(title){
    return api({ action: "query", titles: title, redirects: 1 }).then(function(d){
      var p = d.query && d.query.pages && d.query.pages[0];
      return (p && !p.missing && !p.invalid) ? p.title : null;
    });
  }

  function begin(){
    var f = $("fromIn").value.trim(), t = $("toIn").value.trim();
    if(!f || !t){ setErr("Enter both a start article and a target article."); return; }
    if(party && party.isHost && party.state === "playing" && !window.confirm("Players are still racing. Start a new round anyway?")) return;
    setErr("Checking articles…");
    $("goBtn").disabled = true;
    Promise.all([resolve(f), resolve(t)]).then(function(r){
      $("goBtn").disabled = false;
      if(!r[0]){ setErr("No Wikipedia article called \u201c" + f + "\u201d. Try a suggestion from the list."); return; }
      if(!r[1]){ setErr("No Wikipedia article called \u201c" + t + "\u201d. Try a suggestion from the list."); return; }
      if(norm(r[0]) === norm(r[1])){ setErr("Start and target must be different articles."); return; }
      setErr("");
      from = r[0]; to = r[1];
      if(party && party.isHost) hostStart();
      startRun();
    }).catch(function(){
      $("goBtn").disabled = false;
      setErr("Could not reach Wikipedia. Check your connection and try again.");
    });
  }

  function startRun(){
    stopSpectate(true);
    clicks = 0; path = []; acc = 0; running = false; busy = false; ended = false;
    $("clicks").textContent = "0"; $("timer").textContent = fmt(0);
    $("goalTitle").textContent = to;
    var tl = $("targetLink"); tl.href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(to.replace(/ /g, "_"));
    $("setup").classList.add("hidden"); $("game").classList.remove("hidden");
    $("gbar").classList.remove("hidden"); $("targetPanel").classList.remove("hidden");
    $("specBar").classList.add("hidden"); $("specCursor").classList.add("hidden");
    $("win").classList.add("hidden"); $("solve").classList.add("hidden");
    setBarH();
    renderLog(); renderBoard();
    cancelAnimationFrame(raf); tick();
    load(from, true);
  }

  function load(title, isStart){
    if(busy || ended || spectating) return;
    busy = true; stopClock();
    if(!isStart){ clicks++; $("clicks").textContent = clicks; }
    var wrap = document.querySelector(".artwrap");
    var ov = document.createElement("div"); ov.className = "loading"; ov.textContent = "Loading…";
    wrap.appendChild(ov);
    api({ action: "parse", page: title, redirects: 1, prop: "text", disableeditsection: 1 }).then(function(d){
      if(!d.parse) throw new Error("missing");
      var real = d.parse.title;
      path.push({ title: real, ms: elapsed() });
      render(real, d.parse.text);
      ov.remove(); busy = false;
      renderLog();
      if(!isStart && norm(real) === norm(to)){ finish(); return; }
      sendProg("racing");
      startClock();
      window.scrollTo(0, 0);
    }).catch(function(){
      busy = false;
      if(!isStart){ clicks--; $("clicks").textContent = clicks; }
      ov.textContent = "Could not load that page. Click here to dismiss and try again.";
      ov.style.cursor = "pointer";
      ov.onclick = function(){ ov.remove(); startClock(); };
    });
  }

  function clean(html){
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("style,script,iframe,object,embed,form,.mw-editsection,.navbox,.vertical-navbox,.sistersitebox,.ambox,.metadata,.noprint,.mw-empty-elt,.reflist,.refbegin,.reference,.mw-references-wrap,.catlinks,.toc,#toc,.sidebar,.shortdescription,.navbar,.authority-control").forEach(function(n){ n.remove(); });
    doc.querySelectorAll("*").forEach(function(el){
      Array.prototype.slice.call(el.attributes).forEach(function(a){
        if(/^on/i.test(a.name)) el.removeAttribute(a.name);
      });
    });
    var cut = false;
    Array.prototype.slice.call(doc.querySelectorAll(".mw-parser-output > *")).forEach(function(n){
      var isH = n.matches(".mw-heading, h2");
      if(isH && /^(references|external links|notes|further reading|see also|bibliography|citations|sources|footnotes)/i.test(n.textContent.trim())) cut = true;
      if(cut) n.remove();
    });
    doc.querySelectorAll("img").forEach(function(i){
      var s = i.getAttribute("src") || "";
      if(s.indexOf("//") === 0) i.setAttribute("src", "https:" + s);
      i.removeAttribute("srcset"); i.setAttribute("loading", "lazy");
    });
    doc.querySelectorAll("a").forEach(function(a){
      var m = (a.getAttribute("href") || "").match(/^\/wiki\/([^#?]+)/);
      var t = null;
      if(m && m[1].indexOf(":") === -1 && !a.classList.contains("image")){
        try { t = decodeURIComponent(m[1]); } catch(e){ t = null; }
      }
      if(t){
        a.setAttribute("data-title", t);
        a.className = "go"; a.removeAttribute("href"); a.tabIndex = 0; a.setAttribute("role", "link");
      } else { a.className = "dead"; a.removeAttribute("href"); }
    });
    return doc;
  }

  function render(title, html){
    var doc = clean(html);
    var art = $("article");
    art.innerHTML = "";
    var h1 = document.createElement("h1"); h1.className = "title"; h1.textContent = title;
    var c = document.createElement("div"); c.className = "content"; c.innerHTML = doc.body.innerHTML;
    var sub = document.createElement("div");
    sub.style.cssText = "font-size:12px;color:var(--muted);margin:-2px 0 10px";
    sub.textContent = "From Wikipedia, the free encyclopedia";
    art.appendChild(h1); art.appendChild(sub); art.appendChild(c);
  }

  function renderLog(){
    var ol = $("log"); ol.innerHTML = "";
    $("logEmpty").classList.toggle("hidden", path.length > 0);
    path.forEach(function(p, i){
      var li = document.createElement("li");
      if(i === path.length - 1) li.className = "cur";
      var n = document.createElement("span"); n.className = "n"; n.textContent = i === 0 ? "Start" : i + ".";
      if(i === 0) n.style.flexBasis = "34px";
      var t = document.createElement("span"); t.className = "t"; t.textContent = p.title;
      var ms = document.createElement("span"); ms.className = "ms"; ms.textContent = fmt(p.ms);
      li.appendChild(n); li.appendChild(t); li.appendChild(ms); ol.appendChild(li);
    });
    ol.scrollTop = ol.scrollHeight;
  }

  function onNav(e){
    if(spectating || ended) return;
    var a = e.target.closest && e.target.closest("a.go");
    if(!a) return;
    if(e.type === "keydown" && e.key !== "Enter") return;
    e.preventDefault();
    load(a.getAttribute("data-title"), false);
  }

  function finish(){
    ended = true;
    stopClock(); cancelAnimationFrame(raf);
    var ms = elapsed();
    sendProg("done");
    $("timer").textContent = fmt(ms);
    $("winTime").textContent = fmt(ms);
    $("winClicks").textContent = clicks + (clicks === 1 ? " click" : " clicks") + " from " + from + " to " + to + ".";
    var ol = $("winPath"); ol.innerHTML = "";
    path.forEach(function(p, i){
      var li = document.createElement("li");
      var n = document.createElement("span"), t = document.createElement("span"), m = document.createElement("span");
      n.className = "n"; t.className = "t"; m.className = "ms";
      n.textContent = i === 0 ? "Start" : i + "."; if(i === 0) n.style.flexBasis = "34px";
      t.textContent = p.title; m.textContent = fmt(p.ms);
      li.appendChild(n); li.appendChild(t); li.appendChild(m);
      if(i === path.length - 1) li.className = "goal-hit";
      ol.appendChild(li);
    });
    var b = getBest(from, to), nb = !b || ms < b.ms;
    if(nb) setBest({ ms: Math.round(ms), clicks: clicks });
    $("pb").classList.toggle("hidden", !nb);
    $("win").classList.remove("hidden");
    $("againBtn").focus(); renderBoard();
  }

  function home(){
    stopClock(); cancelAnimationFrame(raf);
    ended = true;
    stopSpectate(true);
    $("game").classList.add("hidden"); $("gbar").classList.add("hidden"); $("specBar").classList.add("hidden"); $("targetPanel").classList.add("hidden");
    $("win").classList.add("hidden"); $("solve").classList.add("hidden"); solveToken++; $("setup").classList.remove("hidden");
    path = []; renderLog(); setBarH();
    if(party && party.joined && !party.isHost) sendTo(party.hostConn, { t: "ready", ready: false });
    window.scrollTo(0, 0); updateBest(); renderLobby(); renderBoard();
  }

  function copy(txt, btn, label){
    if(!navigator.clipboard) return;
    navigator.clipboard.writeText(txt).then(function(){
      btn.textContent = "Copied!"; setTimeout(function(){ btn.textContent = label; }, 1500);
    }, function(){});
  }

  $("article").addEventListener("click", onNav);
  $("article").addEventListener("keydown", onNav);
  $("goBtn").onclick = begin;
  $("randBtn").onclick = randomRoute;
  $("quitBtn").onclick = giveUp;
  $("againBtn").onclick = home;
  $("shareBtn").onclick = function(){
    copy("Rabbit Hole: " + from + " \u2192 " + to + " in " + $("winTime").textContent + " with " + clicks + " clicks.\nPath: " + path.map(function(p){ return p.title; }).join(" > "), $("shareBtn"), "Copy result");
  };
  $("linkBtn").onclick = function(){
    var u = location.origin + location.pathname + "?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    copy(u, $("linkBtn"), "Copy challenge link");
  };
  ["fromIn", "toIn"].forEach(function(id){
    $(id).addEventListener("keydown", function(e){ if(e.key === "Enter" && $(id).nextElementSibling.classList.contains("hidden")) begin(); });
  });

  function myName(){
    var n = RH.cleanName($("partyName").value);
    if(!n || RH.censor(n) !== n) n = randName();
    $("partyName").value = n;
    store.set("rabbit-hole:name", n);
    return n;
  }
  function setPartyMsg(m){ $("partyMsg").textContent = m || ""; }
  function plist(){ return party ? Object.keys(party.players).map(function(k){ return party.players[k]; }) : []; }
  function sendTo(conn, m){ try { if(conn && conn.open) conn.send(m); } catch(e){} }
  function broadcast(m){ if(!party) return; Object.keys(party.conns).forEach(function(id){ sendTo(party.conns[id], m); }); }

  function uniqueName(p, name, except){
    var base = RH.cleanName(name) || "Player", n = base, i = 2;
    function taken(x){
      return Object.keys(p.players).some(function(k){ return k !== except && p.players[k].name.toLowerCase() === x.toLowerCase(); });
    }
    while(taken(n)){ n = base.slice(0, 16 - String(i).length - 1) + " " + i; i++; }
    return n;
  }

  function cleanJoinName(n){
    var s = RH.cleanName(n);
    return (!s || RH.censor(s) !== s) ? randName() : s;
  }

  function cleanPlayer(x){
    var st = ["idle", "racing", "done", "gaveup"];
    return {
      id: String(x && x.id || "").slice(0, 64),
      name: RH.cleanName(x && x.name) || "Player",
      host: !!(x && x.host),
      ready: !!(x && x.ready),
      clicks: Math.max(0, Math.min(9999, (x && x.clicks) | 0)),
      ms: Math.max(0, (x && x.ms) | 0),
      status: st.indexOf(x && x.status) >= 0 ? x.status : "idle",
      page: String(x && x.page || "").slice(0, 300)
    };
  }

  function snapshot(p){
    return {
      t: "players",
      list: Object.keys(p.players).map(function(k){ return p.players[k]; }),
      settings: { locked: p.settings.locked, approve: p.settings.approve, max: p.settings.max },
      state: p.state
    };
  }

  function pushPlayers(){
    if(!party) return;
    if(party.isHost){ pruneWatch(party); checkRoundOver(); broadcast(snapshot(party)); }
    renderBoard(); renderLobby();
  }

  function checkRoundOver(){
    var p = party;
    if(!p || !p.isHost || p.state !== "playing") return;
    var l = plist();
    if(!l.length) return;
    if(l.some(function(x){ return x.status === "racing"; })) return;
    p.state = "lobby";
    l.forEach(function(x){ x.ready = false; });
    hostSys(p, "Round over.");
  }

  function sendProg(status){
    if(!party || !party.joined) return;
    var d = { clicks: clicks || 0, status: status || "racing", ms: Math.round(elapsed()), page: path.length ? path[path.length - 1].title : (from || "") };
    if(party.isHost){
      var me = party.players[party.me];
      if(me){ Object.assign(me, d); pushPlayers(); }
    } else sendTo(party.hostConn, Object.assign({ t: "prog" }, d));
  }

  function ranked(list){
    function r(p){ return p.status === "done" ? 0 : (p.status === "gaveup" ? 2 : 1); }
    return list.slice().sort(function(a, b){
      if(r(a) !== r(b)) return r(a) - r(b);
      return r(a) === 0 ? a.ms - b.ms : a.clicks - b.clicks;
    });
  }

  function fillBoard(ol, list){
    ol.innerHTML = "";
    ranked(list).forEach(function(p){
      var li = document.createElement("li"), n = document.createElement("span"), c = document.createElement("span"), s = document.createElement("span");
      n.className = "t"; n.textContent = p.name + (p.host ? " (host)" : "") + (party && p.id === party.me ? " (you)" : "");
      c.className = "ms"; c.textContent = p.clicks + (p.clicks === 1 ? " click" : " clicks");
      s.className = "ms"; s.textContent = p.status === "done" ? "\u2713 " + fmt(p.ms) : (p.status === "gaveup" ? "gave up" : (p.status === "racing" ? "racing" : "waiting"));
      if(p.status === "done") li.className = "goal-hit";
      li.appendChild(n); li.appendChild(c); li.appendChild(s); ol.appendChild(li);
    });
  }

  function renderBoard(){
    var joined = !!party && party.joined;
    var inGame = joined && !$("game").classList.contains("hidden");
    $("boardPanel").classList.toggle("hidden", !inGame);
    $("standings").classList.toggle("hidden", !joined);
    $("solveStandings").classList.toggle("hidden", !joined);
    if(joined){
      var l = plist();
      fillBoard($("board"), l); fillBoard($("standingsList"), l); fillBoard($("solveStandingsList"), l);
    }
    updateSpecButtons();
    syncSpectate();
  }

  function racingOthers(){
    if(!party || !party.joined) return [];
    return plist().filter(function(p){ return p.id !== party.me && p.status === "racing"; });
  }
  function canSpectate(){
    if(!party || !party.joined || party.state !== "playing") return false;
    var me = party.players[party.me];
    return !!me && (me.status === "done" || me.status === "gaveup") && racingOthers().length > 0;
  }
  function updateSpecButtons(){
    var c = canSpectate() && !spectating;
    $("specBtn").classList.toggle("hidden", !c);
    $("specBtn2").classList.toggle("hidden", !c);
  }

  function setWatch(p, watcher, target){
    var old = p.watch[watcher];
    if(target) p.watch[watcher] = target; else delete p.watch[watcher];
    if(old && old !== target) syncWatch(p, old);
    if(target) syncWatch(p, target);
  }
  function syncWatch(p, id){
    var on = Object.keys(p.watch).some(function(w){ return p.watch[w] === id; });
    if(id === p.me) watched = on;
    else if(p.conns[id]) sendTo(p.conns[id], { t: "watch", on: on });
  }
  function pruneWatch(p){
    Object.keys(p.watch).forEach(function(w){
      var t = p.watch[w], a = p.players[w], b = p.players[t];
      if(!a || !b || b.status !== "racing" || a.status === "racing" || p.state !== "playing") setWatch(p, w, null);
    });
  }
  function forwardMouse(p, id, x, y){
    Object.keys(p.watch).forEach(function(w){
      if(p.watch[w] !== id) return;
      if(w === p.me) handleMouse(x, y);
      else sendTo(p.conns[w], { t: "mouse", id: id, x: x, y: y });
    });
  }

  function startSpectate(id){
    if(!canSpectate()) return;
    var others = racingOthers();
    var t = others.some(function(x){ return x.id === id; }) ? id : others[0].id;
    spectating = true;
    ["win", "solve", "setup", "gbar", "targetPanel"].forEach(function(n){ $(n).classList.add("hidden"); });
    $("game").classList.remove("hidden"); $("specBar").classList.remove("hidden");
    setBarH();
    watch(t);
    paintSpec();
    updateSpecButtons();
    window.scrollTo(0, 0);
  }

  function watch(t){
    specTarget = t; specPage = null;
    if(party.isHost) setWatch(party, party.me, t);
    else sendTo(party.hostConn, { t: "spec", target: t });
    $("specCursor").classList.add("hidden");
    var pl = party.players[t];
    if(pl && pl.page) loadSpectate(pl.page);
  }

  function loadSpectate(title){
    specPage = title;
    var tok = ++specSeq;
    api({ action: "parse", page: title, redirects: 1, prop: "text", disableeditsection: 1 }).then(function(d){
      if(tok !== specSeq || !spectating || !d.parse) return;
      render(d.parse.title, d.parse.text);
    }).catch(function(){});
  }

  function paintSpec(){
    var sel = $("specSel"), others = racingOthers();
    sel.innerHTML = "";
    others.forEach(function(p){
      var o = document.createElement("option"); o.value = p.id; o.textContent = p.name; sel.appendChild(o);
    });
    if(specTarget && others.some(function(p){ return p.id === specTarget; })) sel.value = specTarget;
    var pl = party && party.players[specTarget];
    $("specName").textContent = pl ? pl.name : "";
    $("specClicks").textContent = pl ? pl.clicks : 0;
  }

  function syncSpectate(){
    if(!spectating) return;
    if(!party || !party.joined || party.state !== "playing"){ stopSpectate(false); return; }
    var others = racingOthers();
    if(!others.length){ stopSpectate(false); return; }
    if(!others.some(function(x){ return x.id === specTarget; })) watch(others[0].id);
    var pl = party.players[specTarget];
    if(pl && pl.page && pl.page !== specPage) loadSpectate(pl.page);
    paintSpec();
  }

  function stopSpectate(silent){
    if(!spectating) return;
    spectating = false; specSeq++;
    if(party && party.joined){
      if(party.isHost) setWatch(party, party.me, null);
      else sendTo(party.hostConn, { t: "spec", target: null });
    }
    specTarget = null; specPage = null;
    $("specBar").classList.add("hidden"); $("specCursor").classList.add("hidden");
    if(!silent) home();
  }

  function handleMouse(x, y){
    if(!spectating) return;
    var w = document.querySelector(".artwrap"), c = $("specCursor");
    var pl = party && party.players[specTarget];
    $("specCursorName").textContent = pl ? pl.name : "";
    c.classList.remove("hidden");
    c.style.left = (x * w.clientWidth) + "px";
    c.style.top = y + "px";
    var ay = w.getBoundingClientRect().top + window.scrollY + y;
    if(ay < window.scrollY + 90 || ay > window.scrollY + window.innerHeight - 90){
      window.scrollTo({ top: Math.max(0, ay - window.innerHeight / 3), behavior: "smooth" });
    }
  }

  document.addEventListener("mousemove", function(e){
    if(!party || !party.joined || !watched || ended || spectating) return;
    var now = performance.now();
    if(now - lastMouse < 80) return;
    lastMouse = now;
    var w = document.querySelector(".artwrap"), r = w.getBoundingClientRect();
    if(!r.width) return;
    var x = Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000) / 1000;
    var y = Math.round(Math.max(0, e.clientY - r.top));
    if(party.isHost) forwardMouse(party, party.me, x, y);
    else sendTo(party.hostConn, { t: "mouse", x: x, y: y });
  });

  $("specBtn").onclick = function(){ startSpectate(null); };
  $("specBtn2").onclick = function(){ startSpectate(null); };
  $("specStop").onclick = function(){ stopSpectate(false); };
  $("specSel").onchange = function(){ if(spectating && this.value && this.value !== specTarget) watch(this.value); };

  function chatAdd(name, text, sys){
    var ol = $("chatLog"), li = document.createElement("li");
    if(sys){
      li.className = "sys"; li.textContent = text;
    } else {
      var n = document.createElement("span"), t = document.createElement("span");
      n.className = "cn"; n.textContent = name + ": ";
      t.textContent = text;
      li.appendChild(n); li.appendChild(t);
    }
    ol.appendChild(li);
    while(ol.children.length > 60) ol.removeChild(ol.firstChild);
    ol.scrollTop = ol.scrollHeight;
  }

  function hostSys(p, text){
    broadcast({ t: "chat", sys: true, text: text });
    chatAdd("", text, true);
  }

  function notify(p, id, text){
    if(id === p.me) chatAdd("", text, true);
    else sendTo(p.conns[id], { t: "notice", text: text });
  }

  function hostChat(p, id, raw){
    var pl = p.players[id], meta = p.meta[id];
    if(!pl || !meta) return;
    var now = Date.now();
    meta.chat = meta.chat.filter(function(x){ return now - x < 10000; });
    if((meta.chat.length && now - meta.chat[meta.chat.length - 1] < CHAT_GAP) || meta.chat.length >= CHAT_BURST){
      notify(p, id, "You are sending messages too fast.");
      return;
    }
    var text = RH.cleanText(raw, 140);
    if(!text) return;
    meta.chat.push(now);
    text = RH.censor(text);
    broadcast({ t: "chat", name: pl.name, text: text });
    chatAdd(pl.name, text, false);
  }

  function sendChat(){
    var el = $("chatIn");
    var text = RH.cleanText(el.value, 140);
    if(!text || !party || !party.joined) return;
    var now = Date.now();
    if(now - lastChat < CHAT_GAP) return;
    lastChat = now;
    el.value = "";
    if(party.isHost) hostChat(party, party.me, text);
    else sendTo(party.hostConn, { t: "chat", text: text });
  }
  $("chatSend").onclick = sendChat;
  $("chatIn").addEventListener("keydown", function(e){ if(e.key === "Enter"){ e.preventDefault(); sendChat(); } });

  function handleRename(p, id, raw){
    var pl = p.players[id], meta = p.meta[id];
    if(!pl || !meta) return;
    var now = Date.now();
    if(meta.lastRename && now - meta.lastRename < RENAME_GAP){
      notify(p, id, "You can only change your name every " + (RENAME_GAP / 1000) + " seconds.");
      return;
    }
    var n = RH.cleanName(raw);
    if(!n || RH.censor(n) !== n){ notify(p, id, "That name is not allowed."); return; }
    var old = pl.name;
    n = uniqueName(p, n, id);
    if(n === old) return;
    meta.lastRename = now;
    pl.name = n;
    if(id === p.me) store.set("rabbit-hole:name", n);
    hostSys(p, old + " is now " + n);
    pushPlayers();
  }

  $("renameBtn").onclick = function(){
    if(!party || !party.joined) return;
    var v = RH.cleanName($("renameIn").value);
    if(!v) return;
    var now = Date.now();
    if(now - lastRename < RENAME_GAP){ chatAdd("", "You can only change your name every " + (RENAME_GAP / 1000) + " seconds.", true); return; }
    lastRename = now;
    $("renameIn").value = "";
    if(party.isHost) handleRename(party, party.me, v);
    else sendTo(party.hostConn, { t: "rename", name: v });
  };
  $("renameIn").addEventListener("keydown", function(e){ if(e.key === "Enter") $("renameBtn").click(); });

  function renderLobby(){
    var p = party, host = !!p && p.isHost, inLobby = !!p && p.joined, joining = !!p && !p.joined;
    var guest = inLobby && !host;
    $("partyCreate").classList.toggle("hidden", !!p);
    $("joining").classList.toggle("hidden", !joining);
    $("lobby").classList.toggle("hidden", !inLobby);
    $("chatPanel").classList.toggle("hidden", !inLobby);
    $("routeForm").classList.toggle("hidden", guest);
    $("wait").classList.toggle("hidden", !guest);
    $("goBtn").textContent = host ? "Start for everyone" : "Start the clock";
    if(joining) $("joinStatus").textContent = p.pending ? "Waiting for the host to let you in…" : "Connecting…";
    if(!inLobby) return;

    $("pcode").textContent = p.code;
    $("pstate").textContent = p.state === "playing" ? "Round in progress" : (p.settings.locked ? "Locked" : "Open");
    $("hostCtl").classList.toggle("hidden", !host);
    $("guestCtl").classList.toggle("hidden", !guest);
    $("inviteBtn").classList.toggle("hidden", !host);

    if(host){
      $("optApprove").checked = p.settings.approve;
      $("optLock").checked = p.settings.locked;
      $("optMax").value = String(p.settings.max);
    }

    var reqs = host ? Object.keys(p.pending).map(function(k){ return p.pending[k]; }) : [];
    $("requests").classList.toggle("hidden", !reqs.length);
    var rl = $("reqList"); rl.innerHTML = "";
    reqs.forEach(function(r){
      var li = document.createElement("li"), n = document.createElement("span"), a = document.createElement("button"), d = document.createElement("button");
      n.className = "t"; n.textContent = r.name + " wants to join";
      a.type = "button"; a.className = "btn small primary"; a.textContent = "Accept"; a.onclick = function(){ acceptPending(r.id); };
      d.type = "button"; d.className = "btn small danger"; d.textContent = "Deny"; d.onclick = function(){ denyPending(r.id); };
      li.appendChild(n); li.appendChild(a); li.appendChild(d); rl.appendChild(li);
    });

    var l = plist();
    $("pcount").textContent = "(" + l.length + "/" + p.settings.max + ")";
    var ol = $("lobbyList"); ol.innerHTML = "";
    l.forEach(function(pl){
      var li = document.createElement("li"), n = document.createElement("span");
      n.className = "t"; n.textContent = pl.name + (pl.host ? " (host)" : "") + (pl.id === p.me ? " (you)" : "");
      li.appendChild(n);
      if(!pl.host){
        var b = document.createElement("span"); b.className = "badge"; b.textContent = pl.ready ? "ready" : "not ready"; li.appendChild(b);
      }
      if(host && !pl.host){
        var k = document.createElement("button"); k.type = "button"; k.className = "btn small danger"; k.textContent = "Remove";
        k.onclick = function(){ kick(pl.id); };
        li.appendChild(k);
      }
      ol.appendChild(li);
    });

    if(guest){
      var me = p.players[p.me];
      $("readyBtn").textContent = me && me.ready ? "Not ready" : "I'm ready";
    }
    var note = $("readyNote");
    if(host){
      var g = l.filter(function(x){ return !x.host; }), r = g.filter(function(x){ return x.ready; }).length;
      note.classList.remove("hidden");
      note.textContent = g.length ? r + " of " + g.length + " players ready." : "Waiting for players to join. You can also start solo.";
    } else note.classList.add("hidden");
  }

  function leaveParty(keepMsg){
    var p = party;
    if(p){
      clearInterval(p.timer);
      if(spectating) stopSpectate(true);
      party = null;
      if(p.isHost){
        Object.keys(p.conns).forEach(function(id){ sendTo(p.conns[id], { t: "bye" }); });
        Object.keys(p.pending).forEach(function(id){
          clearTimeout(p.pending[id].tmo);
          if(p.raw[id]) sendTo(p.raw[id].conn, { t: "reject", reason: "denied" });
        });
      } else sendTo(p.hostConn, { t: "leave" });
      setTimeout(function(){ try { p.peer.destroy(); } catch(e){} }, 300);
    }
    watched = false;
    $("chatLog").innerHTML = "";
    if(!keepMsg) setPartyMsg("");
    if(!$("game").classList.contains("hidden")) home();
    renderLobby(); renderBoard();
  }

  function hostStart(){
    var p = party;
    Object.keys(p.pending).forEach(function(id){ dropPeer(p, id, "inround"); });
    p.state = "playing";
    Object.keys(p.players).forEach(function(k){
      var q = p.players[k];
      q.clicks = 0; q.ms = 0; q.status = "racing"; q.ready = false; q.page = from;
    });
    Object.keys(p.watch).forEach(function(w){ setWatch(p, w, null); });
    broadcast({ t: "start", from: from, to: to });
    hostSys(p, "Round started: " + from + " \u2192 " + to);
    pushPlayers();
  }

  function newCode(){
    var a = "ABCDEFGHJKLMNPQRSTUVWXYZ", s = "";
    for(var i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }
  function newKey(){
    var a = "abcdefghijkmnpqrstuvwxyz23456789", s = "";
    for(var i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  function refuse(conn, reason){
    sendTo(conn, { t: "reject", reason: reason });
    setTimeout(function(){ try { conn.close(); } catch(e){} }, 250);
  }

  function dropPeer(p, id, reason){
    var r = p.raw[id], pd = p.pending[id], conn = r && r.conn;
    var was = p.players[id];
    if(pd) clearTimeout(pd.tmo);
    if(r) clearTimeout(r.tmo);
    Object.keys(p.watch).forEach(function(w){ if(w === id || p.watch[w] === id) setWatch(p, w, null); });
    Object.keys(p.tokens).forEach(function(t){ if(p.tokens[t] === id) delete p.tokens[t]; });
    delete p.raw[id]; delete p.pending[id]; delete p.players[id]; delete p.conns[id]; delete p.meta[id];
    if(conn){
      if(reason) sendTo(conn, { t: "reject", reason: reason });
      setTimeout(function(){ try { conn.close(); } catch(e){} }, 250);
    }
    if(party !== p) return;
    if(was && reason !== "replaced") hostSys(p, was.name + (reason === "kicked" ? " was removed." : " left."));
    pushPlayers();
  }

  function kick(id){
    var p = party;
    if(!p || !p.isHost) return;
    var r = p.raw[id];
    p.blocked[id] = 1;
    if(r && r.token) p.blocked[r.token] = 1;
    dropPeer(p, id, "kicked");
  }

  function denyPending(id){
    var p = party;
    if(!p || !p.isHost) return;
    var r = p.raw[id];
    p.blocked[id] = 1;
    if(r && r.token) p.blocked[r.token] = 1;
    dropPeer(p, id, "denied");
  }

  function admit(p, r, name){
    var id = r.conn.peer;
    clearTimeout(r.tmo);
    r.joined = true; r.pending = false; r.seen = Date.now();
    p.conns[id] = r.conn;
    p.players[id] = { id: id, name: uniqueName(p, name, id), host: false, ready: false, clicks: 0, ms: 0, status: "idle", page: "" };
    p.meta[id] = { lastRename: 0, chat: [] };
    sendTo(r.conn, { t: "welcome", id: id });
    hostSys(p, p.players[id].name + " joined.");
    pushPlayers();
  }

  function acceptPending(id){
    var p = party;
    if(!p || !p.isHost) return;
    var pd = p.pending[id], r = p.raw[id];
    if(!pd || !r) return;
    clearTimeout(pd.tmo);
    delete p.pending[id];
    if(p.state !== "lobby"){ dropPeer(p, id, "inround"); return; }
    if(plist().length >= p.settings.max){ dropPeer(p, id, "full"); return; }
    admit(p, r, pd.name);
  }

  function handleJoin(p, id, r, m){
    var now = Date.now();
    p.joinLog = p.joinLog.filter(function(x){ return now - x < 10000; });
    if(p.joinLog.length >= JOIN_BURST){ dropPeer(p, id, "busy"); return; }
    p.joinLog.push(now);

    var token = typeof m.token === "string" ? m.token.replace(/[^a-z0-9]/gi, "").slice(0, 24) : "";
    if(!token){ dropPeer(p, id, "busy"); return; }
    if(p.blocked[token]){ dropPeer(p, id, "kicked"); return; }
    var lastTry = p.tokenAt[token] || 0;
    p.tokenAt[token] = now;
    if(now - lastTry < TOKEN_GAP){ dropPeer(p, id, "busy"); return; }

    var wasIn = false, prior = p.tokens[token];
    if(prior && prior !== id){
      wasIn = !!p.players[prior];
      dropPeer(p, prior, "replaced");
    }
    p.tokens[token] = id;
    r.token = token;

    if(p.state !== "lobby"){ dropPeer(p, id, "inround"); return; }
    if(!wasIn && p.settings.locked){ dropPeer(p, id, "locked"); return; }
    if(plist().length >= p.settings.max){ dropPeer(p, id, "full"); return; }

    var name = cleanJoinName(m.name);
    var trusted = typeof m.key === "string" && m.key === p.key;
    if(p.settings.approve && !trusted && !wasIn){
      if(Object.keys(p.pending).length >= MAX_PENDING){ dropPeer(p, id, "busy"); return; }
      clearTimeout(r.tmo);
      r.pending = true;
      var pd = p.pending[id] = { id: id, name: name, tmo: setTimeout(function(){ if(p.pending[id] === pd) dropPeer(p, id, "expired"); }, PENDING_TTL) };
      sendTo(r.conn, { t: "pending" });
      chatAdd("", name + " is asking to join.", true);
      renderLobby();
    } else admit(p, r, name);
  }

  function hostMessage(p, id, r, m){
    if(!m || typeof m !== "object" || typeof m.t !== "string") return;
    var now = Date.now();
    r.seen = now;
    if(m.t === "mouse"){
      r.mhits = r.mhits.filter(function(x){ return now - x < 1000; });
      if(r.mhits.length >= MOUSE_BURST) return;
      r.mhits.push(now);
      if(!r.joined) return;
      var x = num(m.x, 0, 1), y = num(m.y, 0, 200000);
      if(x === null || y === null) return;
      forwardMouse(p, id, x, y);
      return;
    }
    r.hits = r.hits.filter(function(h){ return now - h < 5000; });
    if(r.hits.length >= MSG_BURST){ dropPeer(p, id, "busy"); return; }
    r.hits.push(now);
    if(m.t === "join"){ if(!r.joined && !r.pending) handleJoin(p, id, r, m); return; }
    if(m.t === "pong") return;
    if(!r.joined) return;
    var pl = p.players[id];
    if(!pl) return;
    if(m.t === "prog"){
      var st = ["racing", "done", "gaveup"];
      if(st.indexOf(m.status) < 0 || p.state !== "playing") return;
      pl.clicks = Math.max(0, Math.min(9999, m.clicks | 0));
      pl.ms = Math.max(0, m.ms | 0);
      pl.status = m.status;
      pl.page = String(m.page || "").slice(0, 300);
      pushPlayers();
    } else if(m.t === "ready"){
      if(p.state !== "lobby") return;
      pl.ready = !!m.ready;
      pushPlayers();
    } else if(m.t === "rename"){
      handleRename(p, id, m.name);
    } else if(m.t === "chat"){
      hostChat(p, id, m.text);
    } else if(m.t === "spec"){
      var target = typeof m.target === "string" ? m.target : null;
      if(!target){ setWatch(p, id, null); return; }
      var tp = p.players[target];
      if(p.state !== "playing" || pl.status === "racing" || pl.status === "idle" || !tp || tp.status !== "racing" || target === id) return;
      setWatch(p, id, target);
    } else if(m.t === "leave"){
      dropPeer(p, id);
    }
  }

  function hostConnection(p, conn){
    var id = conn.peer, opened = false;
    function onOpen(){
      if(opened) return;
      opened = true;
      if(party !== p) return;
      if(p.blocked[id]){ refuse(conn, "kicked"); return; }
      if(p.raw[id]){ refuse(conn, "busy"); return; }
      if(Object.keys(p.raw).length >= p.settings.max + MAX_PENDING + 2){ refuse(conn, "busy"); return; }
      var r = p.raw[id] = { conn: conn, joined: false, pending: false, seen: Date.now(), hits: [], mhits: [], tmo: null, token: null };
      r.tmo = setTimeout(function(){ if(p.raw[id] === r && !r.joined && !r.pending) dropPeer(p, id, "busy"); }, JOIN_WAIT);
    }
    conn.on("open", onOpen);
    if(conn.open) onOpen();
    conn.on("data", function(m){
      var r = p.raw[id];
      if(!r || r.conn !== conn || party !== p) return;
      hostMessage(p, id, r, m);
    });
    function gone(){
      var r = p.raw[id];
      if(r && r.conn === conn) dropPeer(p, id);
    }
    conn.on("close", gone);
    conn.on("error", gone);
  }

  function hostBeat(p){
    if(party !== p) return;
    var now = Date.now();
    Object.keys(p.raw).forEach(function(id){
      var r = p.raw[id];
      if(!r || !r.joined) return;
      if(now - r.seen > DEAD){ dropPeer(p, id); return; }
      sendTo(r.conn, { t: "ping" });
    });
  }

  function createParty(tries){
    if(party) return;
    if(typeof Peer === "undefined"){ setPartyMsg("Party mode could not load. Check your connection and refresh."); return; }
    var c = newCode(), name = myName();
    var peer = new Peer("rabbit-hole-" + c);
    var p = party = {
      isHost: true, joined: true, code: c, key: newKey(), peer: peer, raw: {}, conns: {}, players: {}, pending: {}, meta: {},
      blocked: {}, tokens: {}, tokenAt: {}, joinLog: [], watch: {}, me: null, timer: null, state: "lobby",
      settings: { approve: true, locked: false, max: MAX_PLAYERS }
    };
    setPartyMsg("Creating party…");
    peer.on("open", function(id){
      if(party !== p) return;
      p.me = id;
      p.players[id] = { id: id, name: name, host: true, ready: true, clicks: 0, ms: 0, status: "idle", page: "" };
      p.meta[id] = { lastRename: 0, chat: [] };
      p.timer = setInterval(function(){ hostBeat(p); }, BEAT);
      setPartyMsg("");
      chatAdd("", "Party created. Share the code " + c + " or copy the invite link.", true);
      renderLobby();
    });
    peer.on("connection", function(conn){
      if(party === p) hostConnection(p, conn);
      else { try { conn.close(); } catch(e){} }
    });
    peer.on("error", function(e){
      if(party !== p) return;
      if(e.type === "unavailable-id" && (tries || 0) < 5){
        party = null;
        try { peer.destroy(); } catch(x){}
        createParty((tries || 0) + 1);
      } else { setPartyMsg("Could not create a party (" + e.type + ")."); leaveParty(true); }
    });
    renderLobby();
  }

  function guestMessage(p, m){
    if(!m || typeof m !== "object" || typeof m.t !== "string") return;
    p.lastHost = Date.now();
    if(m.t === "ping"){ sendTo(p.hostConn, { t: "pong" }); return; }
    if(m.t === "pending"){ p.pending = true; renderLobby(); return; }
    if(m.t === "welcome"){
      p.joined = true; p.pending = false;
      $("chatLog").innerHTML = "";
      setPartyMsg("");
      renderLobby();
      return;
    }
    if(m.t === "reject"){ setPartyMsg(REASONS[m.reason] || "Could not join that party."); leaveParty(true); return; }
    if(m.t === "bye"){ setPartyMsg("The host closed the party."); leaveParty(true); return; }
    if(!p.joined) return;
    if(m.t === "players"){
      if(!Array.isArray(m.list)) return;
      p.players = {};
      m.list.slice(0, 32).forEach(function(x){ var c = cleanPlayer(x); if(c.id) p.players[c.id] = c; });
      if(m.settings && typeof m.settings === "object"){
        p.settings = { locked: !!m.settings.locked, approve: !!m.settings.approve, max: Math.max(2, Math.min(MAX_PLAYERS, m.settings.max | 0)) };
      }
      p.state = m.state === "playing" ? "playing" : "lobby";
      renderBoard(); renderLobby();
    } else if(m.t === "start"){
      if(typeof m.from !== "string" || typeof m.to !== "string" || m.from.length > 300 || m.to.length > 300) return;
      from = m.from; to = m.to;
      startRun();
    } else if(m.t === "chat"){
      var text = RH.censor(RH.cleanText(m.text, 140));
      if(!text) return;
      if(m.sys) chatAdd("", text, true);
      else chatAdd(RH.cleanName(m.name) || "Player", text, false);
    } else if(m.t === "notice"){
      var nt = RH.cleanText(m.text, 140);
      if(nt) chatAdd("", nt, true);
    } else if(m.t === "watch"){
      watched = !!m.on;
    } else if(m.t === "mouse"){
      var x = num(m.x, 0, 1), y = num(m.y, 0, 200000);
      if(x !== null && y !== null && m.id === specTarget) handleMouse(x, y);
    }
  }

  function joinParty(){
    if(party) return;
    var now = Date.now();
    if(now < joinUntil){ setPartyMsg("Wait a moment before trying again."); return; }
    joinUntil = now + 3000;
    var c = $("joinCode").value.trim().toUpperCase();
    if(!/^[A-Z]{5}$/.test(c)){ setPartyMsg("Enter the 5-letter party code."); return; }
    if(typeof Peer === "undefined"){ setPartyMsg("Party mode could not load. Check your connection and refresh."); return; }
    var name = myName(), k = c === inviteCode ? inviteKey : "";
    var peer = new Peer(), opened = false;
    var p = party = {
      isHost: false, joined: false, pending: false, code: c, peer: peer, players: {}, me: null, hostConn: null,
      settings: { locked: false, approve: true, max: MAX_PLAYERS }, state: "lobby", lastHost: Date.now(), timer: null
    };
    setPartyMsg("");
    renderLobby();
    var tmo = setTimeout(function(){ if(!opened && party === p){ setPartyMsg("Could not reach that party."); leaveParty(true); } }, 12000);
    peer.on("open", function(id){
      if(party !== p) return;
      p.me = id;
      var conn = p.hostConn = peer.connect("rabbit-hole-" + c, { reliable: true });
      conn.on("open", function(){
        if(party !== p) return;
        opened = true; clearTimeout(tmo);
        p.lastHost = Date.now();
        conn.send({ t: "join", name: name, key: k, token: TOKEN });
        p.timer = setInterval(function(){
          if(party !== p) return;
          if(Date.now() - p.lastHost > DEAD){ setPartyMsg("Lost connection to the host."); leaveParty(true); }
        }, BEAT);
        renderLobby();
      });
      conn.on("data", function(m){ if(party === p) guestMessage(p, m); });
      conn.on("close", function(){
        if(party === p){ setPartyMsg(p.joined ? "The host left the party." : "The host closed the connection."); leaveParty(true); }
      });
    });
    peer.on("error", function(e){
      if(party !== p) return;
      clearTimeout(tmo);
      setPartyMsg(e.type === "peer-unavailable" ? "No party with that code." : "Connection error (" + e.type + ").");
      leaveParty(true);
    });
  }

  var htmlCache = {}, solveToken = 0;
  function getHtml(t){
    if(!htmlCache[t]) htmlCache[t] = api({ action: "parse", page: t, redirects: 1, prop: "text", disableeditsection: 1 }).then(function(d){ return d.parse ? d.parse.text : ""; });
    return htmlCache[t];
  }
  function bodyLinks(html){
    var seen = {}, out = [];
    clean(html).querySelectorAll("a.go").forEach(function(a){
      var t = a.getAttribute("data-title").replace(/_/g, " ");
      if(!seen[t]){ seen[t] = 1; out.push(t); }
    });
    return out;
  }
  function chunks(a, n){ var o = []; for(var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function pool(items, n, fn){
    var i = 0;
    function next(){ if(i >= items.length) return Promise.resolve(); return fn(items[i++]).then(next); }
    var w = []; for(var k = 0; k < n; k++) w.push(next());
    return Promise.all(w);
  }
  function fetchLinks(titles, kind, cap){
    var res = {}, red = {}, total = 0;
    function one(group){
      var extra = {};
      function step(){
        var q = { action: "query", titles: group.join("|") };
        if(kind === "links"){ q.prop = "links"; q.pllimit = "max"; q.plnamespace = 0; q.redirects = 1; }
        else { q.prop = "linkshere"; q.lhlimit = "max"; q.lhnamespace = 0; q.lhprop = "title"; }
        Object.assign(q, extra);
        return api(q).then(function(d){
          var Q = d.query || {};
          (Q.normalized || []).concat(Q.redirects || []).forEach(function(r){ red[r.from] = r.to; });
          (Q.pages || []).forEach(function(pg){
            var arr = res[pg.title] = res[pg.title] || [];
            (pg[kind] || []).forEach(function(l){ arr.push(l.title); total++; });
          });
          if(d.continue && total < cap){ extra = d.continue; return step(); }
        });
      }
      return step();
    }
    return pool(chunks(titles, 50), 6, one).then(function(){
      var out = {};
      titles.forEach(function(t){ var k = red[t] || t; k = red[k] || k; out[t] = res[k] || []; });
      return out;
    });
  }
  function aliasesOf(t){
    return api({ action: "query", prop: "redirects", titles: t, rdlimit: "max", rdnamespace: 0 }).then(function(d){
      var pg = d.query && d.query.pages && d.query.pages[0];
      return ((pg && pg.redirects) || []).map(function(r){ return r.title; }).slice(0, 49);
    });
  }
  function backward(A, cap){
    return fetchLinks(A, "linkshere", cap).then(function(r){
      var m = {}; A.forEach(function(a){ (r[a] || []).forEach(function(x){ if(!m[x]) m[x] = a; }); }); return m;
    });
  }

  async function search(ctx, isA, banned, say){
    var s0 = ctx.from, i, j, f, c, b, kids;
    function ok(a, z){ return !banned[a + ">" + z]; }
    var F1 = ctx.F1.filter(function(x){ return ok(s0, x); });
    for(i = 0; i < F1.length; i++) if(isA[F1[i]]) return [s0, F1[i]];
    if(!ctx.B1){ say("Checking which pages link to the target…"); ctx.B1 = await backward(ctx.A, 4000); }
    for(i = 0; i < F1.length; i++){ f = F1[i]; if(ctx.B1[f] && ok(f, ctx.B1[f])) return [s0, f, ctx.B1[f]]; }
    if(!ctx.F2){ say("Exploring links from " + F1.length + " pages…"); ctx.F2 = await fetchLinks(ctx.F1, "links", 60000); }
    for(i = 0; i < F1.length; i++){
      f = F1[i]; kids = ctx.F2[f] || [];
      for(j = 0; j < kids.length; j++){ c = kids[j]; if(c !== s0 && ctx.B1[c] && ok(f, c) && ok(c, ctx.B1[c])) return [s0, f, c, ctx.B1[c]]; }
    }
    if(!ctx.B2){
      say("Searching one level deeper…");
      var keys = Object.keys(ctx.B1).slice(0, 300), r = await fetchLinks(keys, "linkshere", 30000);
      ctx.B2 = {};
      keys.forEach(function(k){ (r[k] || []).forEach(function(y){ if(!ctx.B2[y]) ctx.B2[y] = k; }); });
    }
    for(i = 0; i < F1.length; i++){ f = F1[i]; b = ctx.B2[f]; if(b && ok(f, b) && ok(b, ctx.B1[b])) return [s0, f, b, ctx.B1[b]]; }
    for(i = 0; i < F1.length; i++){
      f = F1[i]; kids = ctx.F2[f] || [];
      for(j = 0; j < kids.length; j++){ c = kids[j]; b = ctx.B2[c]; if(c !== s0 && b && ok(f, c) && ok(c, b) && ok(b, ctx.B1[b])) return [s0, f, c, b, ctx.B1[b]]; }
    }
    return null;
  }

  async function solve(say){
    var banned = {}, ctx = { from: from }, isA = {};
    say("Reading the start page…");
    ctx.A = [to].concat(await aliasesOf(to));
    ctx.A.forEach(function(a){ isA[a] = 1; });
    ctx.F1 = bodyLinks(await getHtml(from));
    for(var attempt = 0; attempt < 6; attempt++){
      var p = await search(ctx, isA, banned, say), bad = null;
      if(!p) return null;
      say("Double-checking each click…");
      for(var i = 1; i < p.length - 1 && !bad; i++){
        var set = bodyLinks(await getHtml(p[i]));
        if(set.indexOf(p[i + 1]) < 0) bad = p[i] + ">" + p[i + 1];
      }
      if(!bad) return p;
      banned[bad] = 1;
    }
    return null;
  }

  function showSolve(){
    var tok = ++solveToken;
    $("solve").classList.remove("hidden");
    $("solveYou").textContent = "You made " + clicks + (clicks === 1 ? " click" : " clicks") + " going from " + from + " to " + to + ".";
    $("solveStatus").textContent = "Searching Wikipedia for a route…";
    var ol = $("solveList"); ol.innerHTML = "";
    function say(m){ if(tok === solveToken) $("solveStatus").textContent = m; }
    solve(say).then(function(p){
      if(tok !== solveToken) return;
      if(!p){ say("No route of 4 clicks or fewer turned up. These articles may be far apart."); return; }
      say("A fastest route I found: " + (p.length - 1) + (p.length === 2 ? " click." : " clicks."));
      p.forEach(function(t, i){
        var li = document.createElement("li"), n = document.createElement("span"), x = document.createElement("span");
        n.className = "n"; n.textContent = i === 0 ? "Start" : i + "."; if(i === 0) n.style.flexBasis = "34px";
        x.className = "t"; x.textContent = t + (i === p.length - 1 && norm(t) !== norm(to) ? " (redirects to " + to + ")" : "");
        if(i === p.length - 1) li.className = "goal-hit";
        li.appendChild(n); li.appendChild(x); ol.appendChild(li);
      });
    }).catch(function(){ say("The search failed. Check your connection and try again."); });
  }

  function giveUp(){
    if(ended) return;
    ended = true;
    stopClock(); cancelAnimationFrame(raf); busy = true;
    sendProg("gaveup");
    showSolve();
    renderBoard();
  }

  $("createBtn").onclick = function(){ createParty(0); };
  $("joinBtn").onclick = joinParty;
  $("joinCode").addEventListener("input", function(){ this.value = this.value.toUpperCase().replace(/[^A-Z]/g, ""); });
  $("joinCode").addEventListener("keydown", function(e){ if(e.key === "Enter") joinParty(); });
  $("leaveBtn").onclick = function(){ leaveParty(); };
  $("cancelJoinBtn").onclick = function(){ leaveParty(); };
  $("inviteBtn").onclick = function(){
    if(party && party.isHost) copy(location.origin + location.pathname + "?party=" + party.code + "&key=" + party.key, $("inviteBtn"), "Copy invite link");
  };
  $("readyBtn").onclick = function(){
    if(!party || !party.joined || party.isHost) return;
    var me = party.players[party.me];
    sendTo(party.hostConn, { t: "ready", ready: !(me && me.ready) });
  };
  $("optApprove").onchange = function(){ if(party && party.isHost){ party.settings.approve = this.checked; pushPlayers(); } };
  $("optLock").onchange = function(){ if(party && party.isHost){ party.settings.locked = this.checked; pushPlayers(); } };
  (function(){
    var sel = $("optMax");
    for(var i = 2; i <= MAX_PLAYERS; i++){ var o = document.createElement("option"); o.value = String(i); o.textContent = String(i); sel.appendChild(o); }
    sel.onchange = function(){
      if(!party || !party.isHost) return;
      party.settings.max = Math.max(+this.value, plist().length);
      pushPlayers();
    };
  })();
  $("showSolveBtn").onclick = showSolve;
  $("solveBack").onclick = home;
  renderLobby();

  var savedName = store.get("rabbit-hole:name");
  if(savedName && RH.okName(savedName)) $("partyName").value = savedName;

  var qs = new URLSearchParams(location.search);
  if(qs.get("from") && qs.get("to")){ $("fromIn").value = qs.get("from"); $("toIn").value = qs.get("to"); updateBest(); }
  else randomRoute();
  var pc = (qs.get("party") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if(pc.length === 5){
    inviteCode = pc;
    inviteKey = (qs.get("key") || "").replace(/[^a-z0-9]/gi, "").slice(0, 12);
    $("joinCode").value = pc;
    qs.delete("party"); qs.delete("key");
    try { history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs.toString() : "")); } catch(e){}
    $("partyName").focus();
  }
})();
