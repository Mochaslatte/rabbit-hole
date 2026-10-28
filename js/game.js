// WikiDash game, Wikipedia API, peer-to-peer parties, and route solver.
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
  function tick(){ $("timer").textContent = fmt(elapsed()); raf = requestAnimationFrame(tick); }
  function startClock(){ if(!running){ last = performance.now(); running = true; } }
  function stopClock(){ if(running){ acc += performance.now() - last; running = false; } }
  function api(params){
    var q = Object.keys(params).map(function(k){ return k+"="+encodeURIComponent(params[k]); }).join("&");
    return fetch(API+"?"+q+"&format=json&formatversion=2&origin=*").then(function(r){ return r.json(); });
  }
  function key(){ return "wikidash:" + norm(from) + ">" + norm(to); }
  function getBest(f,t){ try { var v = localStorage.getItem("wikidash:"+norm(f)+">"+norm(t)); return v?JSON.parse(v):null; } catch(e){ return null; } }
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
      path.push({title:real, ms:elapsed()});
      render(real, d.parse.text);
      ov.remove(); busy = false;
      renderLog();
      if(!isStart && norm(real) === norm(to)){ finish(); return; }
      sendProg();
      startClock();
      window.scrollTo(0,0);
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
    ol.scrollTop = ol.scrollHeight;
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
    copy("WikiDash: " + from + " → " + to + " in " + $("winTime").textContent + " with " + clicks + " clicks.\nPath: " + path.map(function(p){return p.title;}).join(" > "), $("shareBtn"), "Copy result");
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
      s.className = "ms"; s.textContent = p.done ? "\u2713 " + fmt(p.ms) : (p.gaveUp ? "gave up" : "racing");
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
    broadcast({t:"start", from:from, to:to});
    pushPlayers();
  }
  function newCode(){ var a = "ABCDEFGHJKLMNPQRSTUVWXYZ", s = ""; for(var i=0;i<4;i++) s += a[Math.floor(Math.random()*a.length)]; return s; }

  function createParty(tries){
    if(typeof Peer === "undefined"){ setPartyMsg("Party mode could not load. Check your connection and refresh."); return; }
    var c = newCode(), name = myName();
    var peer = new Peer("wikidash-" + c);
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
      var conn = p.hostConn = peer.connect("wikidash-" + c, {reliable:true});
      conn.on("open", function(){ opened = true; clearTimeout(tmo); setPartyMsg(""); conn.send({t:"join", name:name}); renderLobby(); });
      conn.on("data", function(m){
        if(m.t==="players"){ p.players = {}; m.list.forEach(function(x){ p.players[x.id] = x; }); renderLobby(); renderBoard(); }
        else if(m.t==="start"){ from = m.from; to = m.to; startRun(); }
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
    solve(say).then(function(p){
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
    sendProg(false, true);
    showSolve();
  }

  $("createBtn").onclick = function(){ createParty(0); };
  $("joinBtn").onclick = joinParty;
  $("leaveBtn").onclick = function(){ leaveParty(); };
  $("inviteBtn").onclick = function(){ if(party) copy(location.origin + location.pathname + "?party=" + party.code, $("inviteBtn"), "Copy invite link"); };
  $("showSolveBtn").onclick = showSolve;
  $("solveBack").onclick = home;
  renderLobby();


  var qs = new URLSearchParams(location.search);
  if(qs.get("from") && qs.get("to")){ $("fromIn").value = qs.get("from"); $("toIn").value = qs.get("to"); updateBest(); }
  else randomRoute();
  if(qs.get("party")){ $("joinCode").value = qs.get("party").toUpperCase().slice(0,4); $("partyName").focus(); }
})();
