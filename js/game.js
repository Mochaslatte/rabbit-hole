(function(){
  var API = "https://en.wikipedia.org/w/api.php";
  var POOL = ["Pizza","Albert Einstein","Moon","Ancient Rome","Association football","Guitar","Volcano","Chocolate","Titanic","Cat","Mount Everest","Electricity","Leonardo da Vinci","Coffee","Jazz","Dinosaur","Great Pyramid of Giza","Japan","Bicycle","Great white shark","Bitcoin","Napoleon","Oxygen","Olympic Games","Vampire","Pacific Ocean","Telescope","William Shakespeare","Hamburger","Sahara","Penguin","Internet","World War II","Basketball","Chess","Rainbow","Sushi","Solar System","Wolfgang Amadeus Mozart","Amazon River","Honey","Tornado","Elephant","Brazil","Vincent van Gogh","Lightning","Bread"];
  var $ = function(id){return document.getElementById(id)};
  var from, to;                 // canonical titles for the current run
  var clicks, path, acc, last, running, raf, busy, startedAt;


  /* ---------- helpers ---------- */
  function norm(t){ return (t||"").replace(/_/g," ").trim().toLowerCase(); }
  function fmt(ms){
    var cs = Math.floor(ms/10)%100, s = Math.floor(ms/1000)%60, m = Math.floor(ms/60000);
    return m + ":" + (s<10?"0":"") + s + "." + (cs<10?"0":"") + cs;
  }
  function elapsed(){ return acc + (running ? performance.now() - last : 0); }
  function tick(){ $("timer").textContent = fmt(elapsed()); limitTick(); if(!ended) raf = requestAnimationFrame(tick); }
  function startClock(){ if(!running){ last = performance.now(); running = true; } }
  function stopClock(){ if(running){ acc += performance.now() - last; running = false; } }
  function api(params){
    var q = Object.keys(params).map(function(k){ return k+"="+encodeURIComponent(params[k]); }).join("&");
    return fetch(API+"?"+q+"&format=json&formatversion=2&origin=*").then(function(r){ return r.json(); });
  }
  function key(){ return "rabbit-hole:" + norm(from) + ">" + norm(to); }
  function getBest(f,t){ try { var v = localStorage.getItem("rabbit-hole:"+norm(f)+">"+norm(t)); return v?JSON.parse(v):null; } catch(e){ return null; } }
  function setBest(o){ try { localStorage.setItem(key(), JSON.stringify(o)); } catch(e){} }
  function setErr(m){ $("err").textContent = m || ""; }

  /* ---------- autocomplete ---------- */
  function suggest(input, box){
    var timer, items = [], idx = -1, seq = 0;
    function hide(){ box.classList.add("hidden"); idx = -1; }
    function paint(){
      box.innerHTML = "";
      items.forEach(function(t,i){
        var b = document.createElement("button"); b.type = "button"; b.textContent = t;
        if(i===idx) b.className = "on";
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
        fetch(API+"?action=opensearch&namespace=0&limit=7&format=json&origin=*&search="+encodeURIComponent(v))
          .then(function(r){ return r.json(); })
          .then(function(d){ if(my!==seq) return; items = d[1] || []; idx = -1; paint(); })
          .catch(function(){});
      }, 180);
    });
    input.addEventListener("keydown", function(e){
      if(box.classList.contains("hidden")) return;
      if(e.key==="ArrowDown"){ e.preventDefault(); idx = (idx+1)%items.length; paint(); }
      else if(e.key==="ArrowUp"){ e.preventDefault(); idx = (idx-1+items.length)%items.length; paint(); }
      else if(e.key==="Enter" && idx>=0){ e.preventDefault(); input.value = items[idx]; hide(); }
      else if(e.key==="Escape"){ hide(); }
    });
    input.addEventListener("blur", function(){ setTimeout(hide, 120); });
  }
  suggest($("fromIn"), $("fromSug"));
  suggest($("toIn"), $("toSug"));

  /* ---------- setup ---------- */
  function updateBest(){
    var f = $("fromIn").value.trim(), t = $("toIn").value.trim();
    var b = f && t ? getBest(f,t) : null;
    $("bestLine").textContent = b ? "Your best on this route: " + fmt(b.ms) + " in " + b.clicks + " clicks" : "";
  }
  $("fromIn").addEventListener("change", updateBest);
  $("toIn").addEventListener("change", updateBest);

  function randomRoute(){
    var a = POOL[Math.floor(Math.random()*POOL.length)], b;
    do { b = POOL[Math.floor(Math.random()*POOL.length)]; } while (b === a);
    $("fromIn").value = a; $("toIn").value = b; setErr(""); updateBest();
  }

  function resolve(title){
    return api({action:"query", titles:title, redirects:1}).then(function(d){
      var p = d.query && d.query.pages && d.query.pages[0];
      return (p && !p.missing && !p.invalid) ? p.title : null;
    });
  }

  function begin(){
    var f = $("fromIn").value.trim(), t = $("toIn").value.trim();
    if(!f || !t){ setErr("Enter both a start article and a target article."); return; }
    setErr("Checking articles…");
    $("goBtn").disabled = true;
    Promise.all([resolve(f), resolve(t)]).then(function(r){
      $("goBtn").disabled = false;
      if(!r[0]){ setErr("No Wikipedia article called \u201c"+f+"\u201d. Try a suggestion from the list."); return; }
      if(!r[1]){ setErr("No Wikipedia article called \u201c"+t+"\u201d. Try a suggestion from the list."); return; }
      if(norm(r[0]) === norm(r[1])){ setErr("Start and target must be different articles."); return; }
      setErr("");
      from = r[0]; to = r[1];
      curMode = $("modeSel").value;
      if(party && party.isHost) hostStart();
      startRun();
    }).catch(function(){
      $("goBtn").disabled = false;
      setErr("Could not reach Wikipedia. Check your connection and try again.");
    });
  }

  /* ---------- run ---------- */
  function startRun(){
    clicks = 0; path = []; acc = 0; running = false; busy = false;
    $("clicks").textContent = "0"; $("timer").textContent = fmt(0);
    $("goalTitle").textContent = to;
    var tl = $("targetLink"); tl.href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(to.replace(/ /g,"_"));
    $("setup").classList.add("hidden"); $("game").classList.remove("hidden");
    $("gbar").classList.remove("hidden"); $("targetPanel").classList.remove("hidden");
    $("win").classList.add("hidden");
    document.documentElement.style.setProperty("--barh", $("gbar").offsetHeight + "px");
    $("solve").classList.add("hidden");
    resetExtras();
    renderLog(); renderBoard();
    cancelAnimationFrame(raf); tick();
    load(from, true);
  }

  function load(title, isStart){
    if(busy) return;
    busy = true; stopClock();
    if(!isStart){ clicks++; $("clicks").textContent = clicks; }
    var wrap = document.querySelector(".artwrap");
    var ov = document.createElement("div"); ov.className = "loading"; ov.textContent = "Loading…";
    wrap.appendChild(ov);
    api({action:"parse", page:title, redirects:1, prop:"text", disableeditsection:1}).then(function(d){
      if(!d.parse) throw new Error("missing");
      var real = d.parse.title;
      path.push({title:real, ms:elapsed()}); trackStack(real);
      render(real, d.parse.text);
      ov.remove(); busy = false;
      renderLog();
      if(!isStart && norm(real) === norm(to)){ finish(); return; }
      sendProg();
      if(limitHit()) return;
      startClock();
      window.scrollTo(0,0);
    }).catch(function(){
      busy = false; goingBack = false;
      if(!isStart){ clicks--; $("clicks").textContent = clicks; }
      ov.textContent = "Could not load that page. Click here to dismiss and try again.";
      ov.style.cursor = "pointer";
      ov.onclick = function(){ ov.remove(); startClock(); };
    });
  }

  function clean(html){
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("style,script,.mw-editsection,.navbox,.vertical-navbox,.sistersitebox,.ambox,.metadata,.noprint,.mw-empty-elt,.reflist,.refbegin,.reference,.mw-references-wrap,.catlinks,.toc,#toc,.sidebar,.shortdescription,.navbar,.authority-control").forEach(function(n){ n.remove(); });
    var cut = false;
    Array.prototype.slice.call(doc.querySelectorAll(".mw-parser-output > *")).forEach(function(n){
      var isH = n.matches(".mw-heading, h2");
      if(isH && /^(references|external links|notes|further reading|see also|bibliography|citations|sources|footnotes)/i.test(n.textContent.trim())) cut = true;
      if(cut) n.remove();
    });
    doc.querySelectorAll("img").forEach(function(i){
      var s = i.getAttribute("src") || "";
      if(s.indexOf("//")===0) i.setAttribute("src","https:"+s);
      i.removeAttribute("srcset"); i.setAttribute("loading","lazy");
    });
    doc.querySelectorAll("a").forEach(function(a){
      var m = (a.getAttribute("href")||"").match(/^\/wiki\/([^#?]+)/);
      if(m && m[1].indexOf(":")===-1 && !a.classList.contains("image")){
        a.setAttribute("data-title", decodeURIComponent(m[1]));
        a.className = "go"; a.removeAttribute("href"); a.tabIndex = 0; a.setAttribute("role","link");
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
    path.forEach(function(p,i){
      var li = document.createElement("li");
      if(i === path.length-1) li.className = "cur";
      var n = document.createElement("span"); n.className = "n"; n.textContent = i===0 ? "Start" : i+".";
      if(i===0) n.style.flexBasis = "34px";
      var t = document.createElement("span"); t.className = "t"; t.textContent = p.title;
      var ms = document.createElement("span"); ms.className = "ms"; ms.textContent = fmt(p.ms);
      li.appendChild(n); li.appendChild(t); li.appendChild(ms); ol.appendChild(li);
    });
    ol.scrollTop = ol.scrollHeight; syncBack();
  }

  function onNav(e){
    var a = e.target.closest && e.target.closest("a.go");
    if(!a) return;
    if(e.type==="keydown" && e.key!=="Enter") return;
    e.preventDefault();
    load(a.getAttribute("data-title"), false);
  }

  function finish(){
    stopClock(); cancelAnimationFrame(raf);
    var ms = elapsed();
    sendProg(true,false);
    $("timer").textContent = fmt(ms);
    $("winTime").textContent = fmt(ms);
    $("winClicks").textContent = clicks + (clicks===1?" click":" clicks") + " from " + from + " to " + to + ".";
    var ol = $("winPath"); ol.innerHTML = "";
    path.forEach(function(p,i){
      var li = document.createElement("li");
      li.innerHTML = '<span class="n"></span><span class="t"></span><span class="ms"></span>';
      li.children[0].textContent = i===0 ? "Start" : i+"."; if(i===0) li.children[0].style.flexBasis = "34px";
      li.children[1].textContent = p.title; li.children[2].textContent = fmt(p.ms);
      if(i===path.length-1) li.className = "goal-hit";
      ol.appendChild(li);
    });
    var b = getBest(from,to), nb = !b || ms < b.ms;
    if(nb) setBest({ms:Math.round(ms), clicks:clicks});
    $("pb").classList.toggle("hidden", !nb);
    onWin(ms);
    $("win").classList.remove("hidden");
    $("againBtn").focus(); renderBoard();
  }

  function home(){
    stopClock(); cancelAnimationFrame(raf);
    $("game").classList.add("hidden"); $("gbar").classList.add("hidden"); $("targetPanel").classList.add("hidden");
    $("win").classList.add("hidden"); $("solve").classList.add("hidden"); solveToken++; $("setup").classList.remove("hidden");
    path = []; renderLog(); document.documentElement.style.setProperty("--barh","0px");
    window.scrollTo(0,0); updateBest(); renderLobby(); renderBoard();
  }

  function copy(txt, btn, label){
    if(!navigator.clipboard) return;
    navigator.clipboard.writeText(txt).then(function(){
      btn.textContent = "Copied!"; setTimeout(function(){ btn.textContent = label; }, 1500);
    }, function(){});
  }

  /* ---------- wiring ---------- */
  $("article").addEventListener("click", onNav);
  $("article").addEventListener("keydown", onNav);
  $("goBtn").onclick = begin;
  $("randBtn").onclick = randomRoute;
  $("quitBtn").onclick = giveUp;
  $("againBtn").onclick = home;
  $("shareBtn").onclick = function(){
    copy("Rabbit Hole: " + from + " → " + to + " in " + $("winTime").textContent + " with " + clicks + " clicks.\nPath: " + path.map(function(p){return p.title;}).join(" > "), $("shareBtn"), "Copy result");
  };
  $("linkBtn").onclick = function(){
    var u = location.origin + location.pathname + "?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    copy(u, $("linkBtn"), "Copy challenge link");
  };
  ["fromIn","toIn"].forEach(function(id){
    $(id).addEventListener("keydown", function(e){ if(e.key==="Enter" && $(id).nextElementSibling.classList.contains("hidden")) begin(); });
  });

  /* ---------- party (peer-to-peer via PeerJS, no server needed) ---------- */
  var party = null;
  function myName(){ var n = $("partyName").value.trim().slice(0,16); return n || ("Player" + (10+Math.floor(Math.random()*90))); }
  function setPartyMsg(m){ $("partyMsg").textContent = m || ""; }
  function plist(){ return party ? Object.keys(party.players).map(function(k){ return party.players[k]; }) : []; }
  function broadcast(m){ Object.keys(party.conns).forEach(function(id){ try{ party.conns[id].send(m); }catch(e){} }); }
  function pushPlayers(){ broadcast({t:"players", list:plist()}); renderBoard(); renderLobby(); }
  function sendProg(done, gaveUp){
    if(!party) return;
    var d = {clicks:clicks||0, done:!!done, gaveUp:!!gaveUp, ms:Math.round(elapsed())};
    if(party.isHost){ var me = party.players[party.me]; if(me){ Object.assign(me, d); pushPlayers(); } }
    else if(party.hostConn && party.hostConn.open){ party.hostConn.send(Object.assign({t:"prog"}, d)); }
  }
  function ranked(list){
    function r(p){ return p.done ? 0 : (p.gaveUp ? 2 : 1); }
    return list.slice().sort(function(a,b){
      if(r(a)!==r(b)) return r(a)-r(b);
      return r(a)===0 ? a.ms-b.ms : a.clicks-b.clicks;
    });
  }
  function fillBoard(ol, list, withStatus){
    ol.innerHTML = "";
    ranked(list).forEach(function(p){
      var li = document.createElement("li"), n = document.createElement("span"), c = document.createElement("span"), s = document.createElement("span");
      n.className = "t"; n.textContent = p.name + (p.host ? " (host)" : "") + (party && p.id===party.me ? " (you)" : "");
      c.className = "ms"; c.textContent = p.clicks + (p.clicks===1 ? " click" : " clicks");
      s.className = "ms"; s.textContent = p.done ? "Done " + fmt(p.ms) : (p.gaveUp ? "gave up" : "racing");
      if(p.done) li.className = "goal-hit";
      li.appendChild(n); if(withStatus){ li.appendChild(c); li.appendChild(s); } ol.appendChild(li);
    });
  }
  function renderBoard(){
    var inGame = party && !$("game").classList.contains("hidden");
    $("boardPanel").classList.toggle("hidden", !inGame);
    $("standings").classList.toggle("hidden", !party);
    if(!party) return;
    var l = plist(); fillBoard($("board"), l, true); fillBoard($("standingsList"), l, true);
  }
  function renderLobby(){
    $("partyCreate").classList.toggle("hidden", !!party);
    $("lobby").classList.toggle("hidden", !party);
    var guest = !!party && !party.isHost;
    $("routeForm").classList.toggle("hidden", guest);
    $("wait").classList.toggle("hidden", !guest);
    $("goBtn").textContent = party && party.isHost ? "Start for everyone" : "Start the clock";
    if(!party) return;
    $("pcode").textContent = party.code;
    var ol = $("lobbyList"); ol.innerHTML = "";
    plist().forEach(function(p){
      var li = document.createElement("li"), n = document.createElement("span");
      n.className = "t"; n.textContent = p.name + (p.host ? " (host)" : "") + (p.id===party.me ? " (you)" : "");
      li.appendChild(n); ol.appendChild(li);
    });
  }
  function leaveParty(keepMsg){
    if(party){ try{ party.peer.destroy(); }catch(e){} party = null; }
    if(!keepMsg) setPartyMsg("");
    if(!$("game").classList.contains("hidden")) home();
    renderLobby(); renderBoard();
  }
  function hostStart(){
    Object.keys(party.players).forEach(function(k){ var q = party.players[k]; q.clicks = 0; q.done = false; q.gaveUp = false; q.ms = 0; });
    broadcast({t:"start", from:from, to:to, mode:curMode});
    pushPlayers();
  }
  function newCode(){ var a = "ABCDEFGHJKLMNPQRSTUVWXYZ", s = ""; for(var i=0;i<4;i++) s += a[Math.floor(Math.random()*a.length)]; return s; }

  function createParty(tries){
    if(typeof Peer === "undefined"){ setPartyMsg("Party mode could not load. Check your connection and refresh."); return; }
    var c = newCode(), name = myName();
    var peer = new Peer("rabbit-hole-" + c);
    var p = party = {isHost:true, code:c, peer:peer, conns:{}, players:{}, me:null};
    setPartyMsg("Creating party…");
    peer.on("open", function(id){
      p.me = id; p.players[id] = {id:id, name:name, host:true, clicks:0, done:false, gaveUp:false, ms:0};
      setPartyMsg(""); renderLobby();
    });
    peer.on("connection", function(conn){
      conn.on("data", function(m){
        if(m.t==="join"){
          p.conns[conn.peer] = conn;
          p.players[conn.peer] = {id:conn.peer, name:String(m.name||"Player").slice(0,16), clicks:0, done:false, gaveUp:false, ms:0};
          pushPlayers();
        } else if(m.t==="prog" && p.players[conn.peer]){
          Object.assign(p.players[conn.peer], {clicks:m.clicks|0, done:!!m.done, gaveUp:!!m.gaveUp, ms:m.ms|0});
          pushPlayers();
        }
      });
      conn.on("close", function(){ delete p.conns[conn.peer]; delete p.players[conn.peer]; if(party===p) pushPlayers(); });
    });
    peer.on("error", function(e){
      if(party!==p) return;
      if(e.type==="unavailable-id" && (tries||0) < 5){ party = null; createParty((tries||0)+1); }
      else { setPartyMsg("Could not create a party (" + e.type + ")."); leaveParty(true); }
    });
  }

  function joinParty(){
    var c = $("joinCode").value.trim().toUpperCase();
    if(c.length !== 4){ setPartyMsg("Enter the 4-letter party code."); return; }
    if(typeof Peer === "undefined"){ setPartyMsg("Party mode could not load. Check your connection and refresh."); return; }
    var name = myName(), peer = new Peer(), opened = false;
    var p = party = {isHost:false, code:c, peer:peer, conns:{}, players:{}, me:null, hostConn:null};
    setPartyMsg("Joining…");
    var tmo = setTimeout(function(){ if(!opened && party===p){ setPartyMsg("Could not reach that party."); leaveParty(true); } }, 12000);
    peer.on("open", function(id){
      p.me = id;
      var conn = p.hostConn = peer.connect("rabbit-hole-" + c, {reliable:true});
      conn.on("open", function(){ opened = true; clearTimeout(tmo); setPartyMsg(""); conn.send({t:"join", name:name}); renderLobby(); });
      conn.on("data", function(m){
        if(m.t==="players"){ p.players = {}; m.list.forEach(function(x){ p.players[x.id] = x; }); renderLobby(); renderBoard(); }
        else if(m.t==="start"){ from = m.from; to = m.to; curMode = m.mode || "std"; startRun(); }
      });
      conn.on("close", function(){ if(party===p){ setPartyMsg("The host left the party."); leaveParty(true); } });
    });
    peer.on("error", function(e){
      if(party!==p) return;
      clearTimeout(tmo);
      setPartyMsg(e.type==="peer-unavailable" ? "No party with that code." : "Connection error (" + e.type + ").");
      leaveParty(true);
    });
  }

  /* ---------- route finder (for "give up" and "show shortest route") ---------- */
  var htmlCache = {}, solveToken = 0;
  function getHtml(t){
    if(!htmlCache[t]) htmlCache[t] = api({action:"parse", page:t, redirects:1, prop:"text", disableeditsection:1}).then(function(d){ return d.parse ? d.parse.text : ""; });
    return htmlCache[t];
  }
  function bodyLinks(html){
    var seen = {}, out = [];
    clean(html).querySelectorAll("a.go").forEach(function(a){
      var t = a.getAttribute("data-title").replace(/_/g," ");
      if(!seen[t]){ seen[t] = 1; out.push(t); }
    });
    return out;
  }
  function chunks(a, n){ var o = []; for(var i=0;i<a.length;i+=n) o.push(a.slice(i,i+n)); return o; }
  function pool(items, n, fn){
    var i = 0;
    function next(){ if(i >= items.length) return Promise.resolve(); return fn(items[i++]).then(next); }
    var w = []; for(var k=0;k<n;k++) w.push(next());
    return Promise.all(w);
  }
  // kind: "links" (pages these titles link to) or "linkshere" (pages that link to these titles)
  function fetchLinks(titles, kind, cap){
    var res = {}, red = {}, total = 0;
    function one(group){
      var extra = {};
      function step(){
        var q = {action:"query", titles:group.join("|")};
        if(kind==="links"){ q.prop = "links"; q.pllimit = "max"; q.plnamespace = 0; q.redirects = 1; }
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
    return api({action:"query", prop:"redirects", titles:t, rdlimit:"max", rdnamespace:0}).then(function(d){
      var pg = d.query && d.query.pages && d.query.pages[0];
      return ((pg && pg.redirects) || []).map(function(r){ return r.title; }).slice(0,49);
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
    for(i=0;i<F1.length;i++) if(isA[F1[i]]) return [s0, F1[i]];
    if(!ctx.B1){ say("Checking which pages link to the target…"); ctx.B1 = await backward(ctx.A, 4000); }
    for(i=0;i<F1.length;i++){ f = F1[i]; if(ctx.B1[f] && ok(f, ctx.B1[f])) return [s0, f, ctx.B1[f]]; }
    if(!ctx.F2){ say("Exploring links from " + F1.length + " pages…"); ctx.F2 = await fetchLinks(ctx.F1, "links", 60000); }
    for(i=0;i<F1.length;i++){
      f = F1[i]; kids = ctx.F2[f] || [];
      for(j=0;j<kids.length;j++){ c = kids[j]; if(c!==s0 && ctx.B1[c] && ok(f,c) && ok(c, ctx.B1[c])) return [s0, f, c, ctx.B1[c]]; }
    }
    if(!ctx.B2){
      say("Searching one level deeper…");
      var keys = Object.keys(ctx.B1).slice(0, 300), r = await fetchLinks(keys, "linkshere", 30000);
      ctx.B2 = {};
      keys.forEach(function(k){ (r[k] || []).forEach(function(y){ if(!ctx.B2[y]) ctx.B2[y] = k; }); });
    }
    for(i=0;i<F1.length;i++){ f = F1[i]; b = ctx.B2[f]; if(b && ok(f,b) && ok(b, ctx.B1[b])) return [s0, f, b, ctx.B1[b]]; }
    for(i=0;i<F1.length;i++){
      f = F1[i]; kids = ctx.F2[f] || [];
      for(j=0;j<kids.length;j++){ c = kids[j]; b = ctx.B2[c]; if(c!==s0 && b && ok(f,c) && ok(c,b) && ok(b, ctx.B1[b])) return [s0, f, c, b, ctx.B1[b]]; }
    }
    return null;
  }

  async function solve(say){
    var banned = {}, ctx = {from:from}, isA = {};
    say("Reading the start page…");
    ctx.A = [to].concat(await aliasesOf(to));
    ctx.A.forEach(function(a){ isA[a] = 1; });
    ctx.F1 = bodyLinks(await getHtml(from));
    for(var attempt=0; attempt<6; attempt++){
      var p = await search(ctx, isA, banned, say), bad = null;
      if(!p) return null;
      say("Double-checking each click…");
      for(var i=1; i<p.length-1 && !bad; i++){
        var set = bodyLinks(await getHtml(p[i]));
        if(set.indexOf(p[i+1]) < 0) bad = p[i] + ">" + p[i+1];
      }
      if(!bad) return p;
      banned[bad] = 1;
    }
    return null;
  }

  function showSolve(){
    var tok = ++solveToken;
    $("solve").classList.remove("hidden");
    $("solveYou").textContent = "You made " + clicks + (clicks===1 ? " click" : " clicks") + " going from " + from + " to " + to + ".";
    $("solveStatus").textContent = "Searching Wikipedia for a route…";
    var ol = $("solveList"); ol.innerHTML = "";
    function say(m){ if(tok===solveToken) $("solveStatus").textContent = m; }
    getPar(say).then(function(p){
      if(tok !== solveToken) return;
      if(!p){ say("No route of 4 clicks or fewer turned up. These articles may be far apart."); return; }
      say("A fastest route I found: " + (p.length-1) + (p.length===2 ? " click." : " clicks."));
      p.forEach(function(t,i){
        var li = document.createElement("li"), n = document.createElement("span"), x = document.createElement("span");
        n.className = "n"; n.textContent = i===0 ? "Start" : i + "."; if(i===0) n.style.flexBasis = "34px";
        x.className = "t"; x.textContent = t + (i===p.length-1 && norm(t)!==norm(to) ? " (redirects to " + to + ")" : "");
        if(i===p.length-1) li.className = "goal-hit";
        li.appendChild(n); li.appendChild(x); ol.appendChild(li);
      });
    }).catch(function(){ say("The search failed. Check your connection and try again."); });
  }

  function giveUp(){
    stopClock(); cancelAnimationFrame(raf); busy = true;
    $("solveTitle").textContent = "How you could have done it";
    sendProg(false, true);
    showSolve();
  }

  $("createBtn").onclick = function(){ createParty(0); };
  $("joinBtn").onclick = joinParty;
  $("leaveBtn").onclick = function(){ leaveParty(); };
  $("inviteBtn").onclick = function(){ if(party) copy(location.origin + location.pathname + "?party=" + party.code, $("inviteBtn"), "Copy invite link"); };
  $("showSolveBtn").onclick = function(){ $("solveTitle").textContent = "How you could have done it"; showSolve(); };
  $("solveBack").onclick = home;
  renderLobby();


  /* ---------- extras: daily route, hints, back, stats, achievements, par ---------- */
  var LS = "rabbit-hole:", stack = [], goingBack = false, runDaily = false, hintsUsed = 0, hintMap = null, hintBusy = false, parCache = {};
  function store(k, v){
    try{
      if(v === undefined){ var r = localStorage.getItem(LS + k); return r ? JSON.parse(r) : null; }
      localStorage.setItem(LS + k, JSON.stringify(v));
    }catch(e){ return null; }
  }
  function dayKey(d){ return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate(); }
  function dailyRoute(){
    var k = dayKey(new Date()), s = 7;
    for(var i=0;i<k.length;i++) s = (Math.imul(s, 31) + k.charCodeAt(i)) >>> 0;
    function r(){ s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    var a = POOL[Math.floor(r()*POOL.length)], b;
    do { b = POOL[Math.floor(r()*POOL.length)]; } while(b === a);
    return {key:k, from:a, to:b};
  }
  function streak(){
    var done = store("daily") || [], n = 0, d = new Date();
    if(done.indexOf(dayKey(d)) < 0) d.setDate(d.getDate() - 1);
    while(done.indexOf(dayKey(d)) >= 0){ n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function updateDaily(){
    var d = dailyRoute(), done = (store("daily") || []).indexOf(d.key) >= 0, st = streak();
    $("dailyLine").textContent = "Today's route: " + d.from + " to " + d.to + (done ? " (completed)" : "") + (st ? ". Daily streak: " + st + "." : "");
  }

  function trackStack(t){ if(goingBack){ stack.pop(); goingBack = false; } else stack.push(t); }
  function syncBack(){ $("backBtn").disabled = stack.length < 2; }
  function goBack(){ if(busy || stack.length < 2) return; goingBack = true; load(stack[stack.length-2], false); }

  function resetExtras(){
    var d = dailyRoute();
    runDaily = $("fromIn").value.trim() === d.from && $("toIn").value.trim() === d.to && !(party && !party.isHost);
    hintsUsed = 0; hintMap = null; hintBusy = false; stack = []; goingBack = false;
    $("hintBtn").disabled = false; $("hintBtn").textContent = "Hint (+10s)";
    $("targetInfo").textContent = "";
    ended = false; var bb = getBest(from, to); $("bestNow").textContent = bb ? fmt(bb.ms) : "-";
    var tt = to;
    api({action:"query", prop:"extracts", exintro:1, explaintext:1, exsentences:2, redirects:1, titles:tt}).then(function(r){
      var pg = r.query && r.query.pages && r.query.pages[0];
      if(tt === to && pg && pg.extract) $("targetInfo").textContent = pg.extract;
    }).catch(function(){});
    syncBack();
  }

  // Hint: highlight links on this page that lead to an article which links straight to the target.
  function hint(){
    if(busy || hintBusy || !running) return;
    hintBusy = true;
    var btn = $("hintBtn"); btn.disabled = true; btn.textContent = "Looking…";
    var ready = hintMap ? Promise.resolve(hintMap) : aliasesOf(to).then(function(al){
      var A = [to].concat(al);
      return backward(A, 4000).then(function(m){ A.forEach(function(a){ m[a] = 1; }); return m; });
    });
    ready.then(function(m){
      hintMap = m;
      var n = 0;
      document.querySelectorAll("#article a.go").forEach(function(a){
        if(m[a.getAttribute("data-title").replace(/_/g, " ")]){ a.classList.add("hint"); n++; }
      });
      if(n){ acc += 10000; hintsUsed++; }
      btn.textContent = n ? n + (n === 1 ? " lead shown" : " leads shown") : "No leads on this page";
      var f = document.querySelector("#article a.go.hint");
      if(f) f.scrollIntoView({block:"center", behavior:"smooth"});
      setTimeout(function(){ btn.textContent = "Hint (+10s)"; btn.disabled = false; hintBusy = false; }, 2200);
    }).catch(function(){ btn.textContent = "Hint (+10s)"; btn.disabled = false; hintBusy = false; });
  }

  // Par: the shortest route length, searched once per route and cached.
  function getPar(say){
    var k = from + ">" + to;
    if(!parCache[k]) parCache[k] = solve(say || function(){}).catch(function(e){ delete parCache[k]; throw e; });
    return parCache[k];
  }

  var ACH = [
    {id:"first", name:"First descent", desc:"Finish any route."},
    {id:"quick", name:"Quick draw", desc:"Finish a route in under 60 seconds."},
    {id:"straight", name:"Straight shot", desc:"Finish in 3 clicks or fewer."},
    {id:"par", name:"On par", desc:"Match the shortest route length."},
    {id:"clean", name:"No help needed", desc:"Finish 10 routes without using a hint."},
    {id:"streak", name:"Three days running", desc:"Complete the daily route 3 days in a row."},
    {id:"deep", name:"Deep in the hole", desc:"Finish 25 routes."}
  ];
  function unlock(id){
    var a = store("ach") || {};
    if(a[id]) return null;
    a[id] = dayKey(new Date()); store("ach", a);
    for(var i=0;i<ACH.length;i++) if(ACH[i].id === id) return ACH[i].name;
    return null;
  }
  function onWin(ms){
    var runs = store("runs") || [];
    runs.push({f:from, t:to, ms:Math.round(ms), c:clicks, h:hintsUsed, d:Date.now()});
    runs = runs.slice(-200); store("runs", runs);
    if(runDaily){
      var done = store("daily") || [], k = dayKey(new Date());
      if(done.indexOf(k) < 0){ done.push(k); store("daily", done.slice(-400)); }
      updateDaily();
    }
    var got = [];
    [["first", true], ["quick", ms < 60000], ["straight", clicks <= 3],
     ["clean", runs.filter(function(r){ return r.h === 0; }).length >= 10],
     ["streak", streak() >= 3], ["deep", runs.length >= 25]].forEach(function(c){
      if(c[1]){ var n = unlock(c[0]); if(n) got.push(n); }
    });
    $("winAch").textContent = got.length ? "Unlocked: " + got.join(", ") : "";
    $("winPar").textContent = "Checking the shortest route…";
    var f0 = from, t0 = to;
    getPar().then(function(p){
      if(f0 !== from || t0 !== to) return;
      if(!p){ $("winPar").textContent = "No short route was found to compare against."; return; }
      var par = p.length - 1;
      $("winPar").textContent = "Par is " + par + (par === 1 ? " click. " : " clicks. ") + (clicks <= par ? "You matched par." : "You finished " + (clicks - par) + " over.");
      if(clicks <= par){
        var n = unlock("par");
        if(n) $("winAch").textContent += ($("winAch").textContent ? ", " : "Unlocked: ") + n;
      }
    }).catch(function(){ $("winPar").textContent = ""; });
  }

  function renderStats(){
    var runs = store("runs") || [], a = store("ach") || {}, n = runs.length;
    function sum(f){ return runs.reduce(function(s, r){ return s + f(r); }, 0); }
    var cells = [
      ["Routes finished", n],
      ["Fastest time", n ? fmt(Math.min.apply(null, runs.map(function(r){ return r.ms; }))) : "-"],
      ["Average time", n ? fmt(sum(function(r){ return r.ms; }) / n) : "-"],
      ["Average clicks", n ? (sum(function(r){ return r.c; }) / n).toFixed(1) : "-"],
      ["Daily streak", streak()],
      ["Hints used", sum(function(r){ return r.h; })]
    ];
    var g = $("sgrid"); g.innerHTML = "";
    cells.forEach(function(c){
      var d = document.createElement("div"), b = document.createElement("b");
      d.textContent = c[0]; b.textContent = c[1]; d.appendChild(b); g.appendChild(d);
    });
    var ul = $("achList"); ul.innerHTML = "";
    ACH.forEach(function(x){
      var li = document.createElement("li"), b = document.createElement("b");
      li.className = a[x.id] ? "on" : "locked"; b.textContent = x.name;
      li.appendChild(b); li.appendChild(document.createTextNode(" - " + x.desc + (a[x.id] ? " Unlocked." : "")));
      ul.appendChild(li);
    });
    var ol = $("runList"); ol.innerHTML = "";
    if(!n){ var e = document.createElement("li"); e.textContent = "No finished runs yet."; ol.appendChild(e); }
    runs.slice(-10).reverse().forEach(function(r){
      var li = document.createElement("li"), t = document.createElement("span"), m = document.createElement("span");
      t.className = "t"; t.textContent = r.f + " to " + r.t;
      m.className = "ms"; m.textContent = fmt(r.ms) + ", " + r.c + (r.c === 1 ? " click" : " clicks");
      li.appendChild(t); li.appendChild(m); ol.appendChild(li);
    });
    renderRecords(runs);
    $("stats").classList.remove("hidden");
    $("statsClose").focus();
  }

  $("hintBtn").onclick = hint;
  $("backBtn").onclick = goBack;
  $("statsBtn").onclick = renderStats;
  $("statsClose").onclick = function(){ $("stats").classList.add("hidden"); };
  $("statsClear").onclick = function(){
    if(!confirm("Delete your run history, achievements, and daily streak?")) return;
    try{ ["runs","ach","daily"].forEach(function(k){ localStorage.removeItem(LS + k); }); }catch(e){}
    renderStats(); updateDaily();
  };
  $("dailyBtn").onclick = function(){
    var d = dailyRoute(); $("fromIn").value = d.from; $("toIn").value = d.to; setErr(""); updateBest();
  };
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") $("stats").classList.add("hidden"); });
  updateDaily();

  /* ---------- more: challenge modes, wild route, records, data export ---------- */
  var curMode = "std", ended = false;
  function modeInfo(){ var m = /^([ct])(\d+)$/.exec(curMode); return m ? {kind:m[1], n:+m[2]} : null; }
  function limitTick(){
    var mi = modeInfo(), el = $("limitNow");
    if(!mi){ el.textContent = "None"; return; }
    if(mi.kind === "t"){
      var left = mi.n * 1000 - elapsed();
      el.textContent = fmt(Math.max(0, left));
      if(left <= 0 && !ended) failRun("Time limit reached");
    } else el.textContent = Math.max(0, mi.n - clicks) + " left";
  }
  function limitHit(){
    var mi = modeInfo();
    if(mi && mi.kind === "c" && clicks >= mi.n){ failRun("Out of clicks"); return true; }
    return false;
  }
  function failRun(msg){
    if(ended) return;
    ended = true; stopClock(); cancelAnimationFrame(raf); busy = true;
    $("solveTitle").textContent = msg;
    sendProg(false, true); showSolve();
  }

  // Wild route: two random Wikipedia articles, both reasonably long so they have plenty of links.
  function wildRoute(tries){
    setErr("Finding two random articles…");
    api({action:"query", generator:"random", grnnamespace:0, grnlimit:25, prop:"info"}).then(function(d){
      var l = ((d.query && d.query.pages) || []).filter(function(p){ return p.length > 25000; }).map(function(p){ return p.title; });
      if(l.length < 2){ if((tries||0) < 4) return wildRoute((tries||0) + 1); setErr(""); return randomRoute(); }
      $("fromIn").value = l[0]; $("toIn").value = l[1]; setErr(""); updateBest();
    }).catch(function(){ setErr("Could not reach Wikipedia."); });
  }

  function renderRecords(runs){
    var best = {};
    runs.forEach(function(r){ var k = r.f + " to " + r.t; if(!best[k] || r.ms < best[k].ms) best[k] = r; });
    var ol = $("recList"); ol.innerHTML = "";
    var keys = Object.keys(best).sort(function(a, b){ return best[a].ms - best[b].ms; }).slice(0, 5);
    if(!keys.length){ var e = document.createElement("li"); e.textContent = "No records yet."; ol.appendChild(e); }
    keys.forEach(function(k){
      var li = document.createElement("li"), t = document.createElement("span"), m = document.createElement("span");
      t.className = "t"; t.textContent = k;
      m.className = "ms"; m.textContent = fmt(best[k].ms) + ", " + best[k].c + (best[k].c === 1 ? " click" : " clicks");
      li.appendChild(t); li.appendChild(m); ol.appendChild(li);
    });
  }

  $("wildBtn").onclick = function(){ wildRoute(0); };
  $("exportBtn").onclick = function(){
    var o = {runs:store("runs") || [], ach:store("ach") || {}, daily:store("daily") || []};
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(o)], {type:"application/json"}));
    a.download = "rabbit-hole-data.json"; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  };
  $("importBtn").onclick = function(){ $("impFile").click(); };
  $("impFile").onchange = function(){
    var f = this.files[0]; if(!f) return;
    var rd = new FileReader();
    rd.onload = function(){
      try{
        var o = JSON.parse(rd.result);
        if(Array.isArray(o.runs)) store("runs", o.runs.slice(-200));
        if(o.ach && typeof o.ach === "object" && !Array.isArray(o.ach)) store("ach", o.ach);
        if(Array.isArray(o.daily)) store("daily", o.daily.slice(-400));
        renderStats(); updateDaily();
      }catch(e){ alert("That file is not valid Rabbit Hole data."); }
    };
    rd.readAsText(f); this.value = "";
  };
  document.addEventListener("keydown", function(e){
    if(e.ctrlKey || e.metaKey || e.altKey) return;
    if(e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if($("game").classList.contains("hidden") || document.querySelector(".win:not(.hidden)")) return;
    if(e.key === "b" || e.key === "B") goBack(); else if(e.key === "h" || e.key === "H") hint();
  });

  var qs = new URLSearchParams(location.search);
  if(qs.get("from") && qs.get("to")){ $("fromIn").value = qs.get("from"); $("toIn").value = qs.get("to"); updateBest(); }
  else randomRoute();
  if(qs.get("party")){ $("joinCode").value = qs.get("party").toUpperCase().slice(0,4); $("partyName").focus(); }
})();
