window.ADMIN_PUBLIC_KEYS = [];

(function(){
  var RH = window.RH = window.RH || {};

  var STRONG = [
    "fuck", "shit", "bitch", "nigger", "nigga", "faggot", "whore", "slut", "bastard",
    "asshole", "retard", "pussy", "wank", "twat", "bollocks", "dickhead", "motherfucker"
  ];
  var WEAK = ["ass", "dick", "cock", "cunt", "fag", "rape", "piss", "tit", "cum", "kys"];

  var LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "i", "+": "t" };

  function core(word){
    return word.split("").map(function(c){ return c + "+"; }).join("[^a-z]*");
  }

  var PATTERNS = STRONG.map(function(w){
    return new RegExp("()(" + core(w) + "(?:ing|ers|er|ed|in|s|y)?)", "g");
  }).concat(WEAK.map(function(w){
    return new RegExp("(^|[^a-z])(" + core(w) + "(?:s|es|ed|ing|er|y)?)(?=[^a-z]|$)", "g");
  }));

  function leet(s){
    var out = "";
    for(var i = 0; i < s.length; i++){
      var c = s.charAt(i), l = c.toLowerCase();
      if(l.length !== 1) l = c;
      out += LEET[l] || l;
    }
    return out;
  }

  RH.censor = function(text){
    var s = String(text == null ? "" : text);
    var m = leet(s), out = s.split("");
    PATTERNS.forEach(function(re){
      var r;
      re.lastIndex = 0;
      while((r = re.exec(m)) !== null){
        var start = r.index + r[1].length, end = start + r[2].length;
        for(var i = start; i < end; i++) if(!/\s/.test(out[i])) out[i] = "*";
        if(r[0].length === 0) re.lastIndex++;
      }
    });
    return out.join("");
  };

  var STRIP = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff<>]/g;

  RH.cleanText = function(text, max){
    return String(text == null ? "" : text).replace(STRIP, "").replace(/\s+/g, " ").trim().slice(0, max || 140);
  };

  RH.cleanName = function(name){
    return RH.cleanText(name, 16);
  };

  RH.okName = function(name){
    var n = RH.cleanName(name);
    return !!n && RH.censor(n) === n;
  };
})();

(function(){
  var RH = window.RH = window.RH || {};
  var $ = function(id){ return document.getElementById(id); };
  var KEY = "rabbit-hole:profiles", KEY_STORE = "rabbit-hole:adminkey";
  var NAME_GAP = 10000, MAX_PROFILES = 8;
  var ADMIN_KEYS = (Array.isArray(window.ADMIN_PUBLIC_KEYS) ? window.ADMIN_PUBLIC_KEYS : []).filter(function(k){ return typeof k === "string" && k.length > 20; });
  var subtle = window.crypto && window.crypto.subtle;
  var ECDSA = { name: "ECDSA", namedCurve: "P-256" }, SIG = { name: "ECDSA", hash: "SHA-256" };
  var db = null, listeners = [], lastNameChange = 0, opener = null;

  function toB64(bytes){ var s = ""; for(var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function fromB64(s){ var b = atob(s), a = new Uint8Array(b.length); for(var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function fromB64u(s){ s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while(s.length % 4) s += "="; return fromB64(s); }
  function pubOf(jwk){
    var x = fromB64u(jwk.x), y = fromB64u(jwk.y);
    if(x.length !== 32 || y.length !== 32) throw new Error("bad key");
    var raw = new Uint8Array(65); raw[0] = 4; raw.set(x, 1); raw.set(y, 33);
    return toB64(raw);
  }
  function validJwk(j){ return !!j && j.kty === "EC" && j.crv === "P-256" && typeof j.x === "string" && typeof j.y === "string" && typeof j.d === "string"; }
  function cleanJwk(j){ return { kty: "EC", crv: "P-256", x: j.x, y: j.y, d: j.d }; }
  function readKey(){
    try {
      var j = JSON.parse(localStorage.getItem(KEY_STORE) || "null");
      if(validJwk(j)) return { jwk: j, pub: pubOf(j) };
    } catch(e){}
    return null;
  }
  function keep(j){ try { localStorage.setItem(KEY_STORE, JSON.stringify(j)); } catch(e){} }

  var admin = RH.admin = {
    supported: function(){ return !!subtle; },
    configured: function(){ return ADMIN_KEYS.length > 0; },
    listed: function(pub){ return typeof pub === "string" && ADMIN_KEYS.indexOf(pub) >= 0; },
    hasKey: function(){ return !!readKey(); },
    pub: function(){ var k = readKey(); return k ? k.pub : ""; },
    active: function(){ var k = readKey(); return !!(subtle && k && ADMIN_KEYS.indexOf(k.pub) >= 0); },
    nonce: function(){ var a = new Uint8Array(16); window.crypto.getRandomValues(a); return toB64(a); },
    sign: function(msg){
      return Promise.resolve().then(function(){
        var k = readKey();
        if(!k || !subtle) throw new Error("no key");
        return subtle.importKey("jwk", k.jwk, ECDSA, false, ["sign"]).then(function(key){
          return subtle.sign(SIG, key, new TextEncoder().encode(msg));
        });
      }).then(function(sig){ return toB64(new Uint8Array(sig)); });
    },
    verify: function(pub, msg, sig){
      if(!subtle || !admin.listed(pub) || typeof sig !== "string" || sig.length > 200) return Promise.resolve(false);
      return Promise.resolve().then(function(){
        return subtle.importKey("raw", fromB64(pub), ECDSA, false, ["verify"]).then(function(key){
          return subtle.verify(SIG, key, fromB64(sig), new TextEncoder().encode(msg));
        });
      }).catch(function(){ return false; });
    },
    generate: function(){
      return Promise.resolve().then(function(){
        if(!subtle) throw new Error("Admin keys need a secure page (https or localhost).");
        return subtle.generateKey(ECDSA, true, ["sign", "verify"]);
      }).then(function(k){ return subtle.exportKey("jwk", k.privateKey); }).then(function(j){
        var c = cleanJwk(j);
        keep(c);
        return { pub: pubOf(c), text: JSON.stringify(c) };
      });
    },
    importText: function(text){
      var c, pub;
      return Promise.resolve().then(function(){
        if(!subtle) throw new Error("Admin keys need a secure page (https or localhost).");
        var j = JSON.parse(text);
        if(!validJwk(j)) throw new Error("That is not a Rabbit Hole admin key file.");
        c = cleanJwk(j); pub = pubOf(c);
        return subtle.importKey("jwk", c, ECDSA, false, ["sign"]);
      }).then(function(key){
        var data = new TextEncoder().encode("self-test");
        return subtle.sign(SIG, key, data).then(function(sig){
          return subtle.importKey("raw", fromB64(pub), ECDSA, false, ["verify"]).then(function(pk){
            return subtle.verify(SIG, pk, sig, data);
          });
        });
      }).then(function(good){
        if(!good) throw new Error("That key file is damaged.");
        keep(c);
        return pub;
      });
    },
    clear: function(){ try { localStorage.removeItem(KEY_STORE); } catch(e){} }
  };

  var RESERVED = /(admin|moderator|^mods?$|staff|official|system)/;
  RH.reserved = function(n){ return RESERVED.test(String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "")); };
  RH.checkUsername = function(n){
    if(!n || n.length < 3 || n.length > 16) return "Usernames are 3 to 16 characters.";
    if(!/^[A-Za-z0-9][A-Za-z0-9 _\-]*$/.test(n)) return "Use letters, numbers, spaces, - and _ only.";
    if(RH.censor(n) !== n) return "That username is not allowed.";
    if(RH.reserved(n) && !admin.active()) return "That username is reserved.";
    return "";
  };

  function norm(t){ return (t || "").replace(/_/g, " ").trim().toLowerCase(); }
  function routeKey(f, t){ return norm(f) + ">" + norm(t); }
  function uid(){ return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function randName(){ return "Player" + (10 + Math.floor(Math.random() * 90)); }

  function blank(name){
    return {
      id: uid(), name: name || randName(), created: Date.now(),
      stats: { played: 0, finished: 0, totalClicks: 0, totalMs: 0, partyRaces: 0, partyWins: 0, bestMs: null, bestClicks: null },
      history: [], bests: {}
    };
  }

  function legacyBests(){
    var out = {};
    try {
      for(var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if(!k || k.indexOf("rabbit-hole:") !== 0 || k.indexOf(">") < 0) continue;
        var v = JSON.parse(localStorage.getItem(k));
        if(v && isFinite(v.ms) && isFinite(v.clicks)) out[k.slice(12)] = { ms: v.ms | 0, clicks: v.clicks | 0 };
      }
    } catch(e){}
    return out;
  }

  function load(){
    var v = null;
    try { v = JSON.parse(localStorage.getItem(KEY) || "null"); } catch(e){}
    if(v && v.list && typeof v.list === "object" && Object.keys(v.list).length){
      Object.keys(v.list).forEach(function(id){
        var p = v.list[id], b = blank();
        p.id = id;
        p.name = RH.cleanName(p.name);
        if(RH.checkUsername(p.name)) p.name = b.name;
        p.stats = Object.assign(b.stats, p.stats || {});
        p.history = Array.isArray(p.history) ? p.history.slice(0, 30) : [];
        p.bests = p.bests && typeof p.bests === "object" ? p.bests : {};
      });
      if(!v.list[v.current]) v.current = Object.keys(v.list)[0];
      return v;
    }
    var first = blank(), old = null;
    try { old = RH.cleanName(localStorage.getItem("rabbit-hole:name")); } catch(e){}
    if(old && !RH.checkUsername(old)) first.name = old;
    first.bests = legacyBests();
    var o = { v: 1, current: first.id, list: {} };
    o.list[first.id] = first;
    return o;
  }

  function save(){ try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){} }
  function cur(){ return db.list[db.current]; }
  function emit(kind){ listeners.forEach(function(fn){ try { fn(kind, cur()); } catch(e){} }); }

  var P = RH.profiles = {};
  P.current = function(){ return cur(); };
  P.onChange = function(fn){ listeners.push(fn); };
  P.busy = null;
  P.bestFor = function(f, t){ return cur().bests[routeKey(f, t)] || null; };

  P.setName = function(raw){
    var n = RH.cleanName(raw), now = Date.now();
    if(n === cur().name) return { ok: true };
    var why = RH.checkUsername(n);
    if(why) return { ok: false, msg: why };
    var dup = Object.keys(db.list).some(function(id){ return id !== db.current && db.list[id].name.toLowerCase() === n.toLowerCase(); });
    if(dup) return { ok: false, msg: "You already have a profile with that username." };
    if(lastNameChange && now - lastNameChange < NAME_GAP){
      return { ok: false, msg: "Wait " + Math.ceil((NAME_GAP - (now - lastNameChange)) / 1000) + " seconds before changing your username again." };
    }
    cur().name = n; lastNameChange = now;
    save(); paintAll(); emit("name");
    return { ok: true };
  };

  P.recordRun = function(r){
    var p = cur(), s = p.stats, res = { newTime: false, newClicks: false };
    s.played++;
    if(r.party) s.partyRaces++;
    if(r.outcome === "done"){
      s.finished++; s.totalClicks += r.clicks; s.totalMs += r.ms;
      var k = routeKey(r.from, r.to), b = p.bests[k];
      if(!b){ p.bests[k] = { ms: r.ms, clicks: r.clicks }; res.newTime = res.newClicks = true; }
      else {
        if(r.ms < b.ms){ b.ms = r.ms; res.newTime = true; }
        if(r.clicks < b.clicks){ b.clicks = r.clicks; res.newClicks = true; }
      }
      if(!s.bestMs || r.ms < s.bestMs.ms) s.bestMs = { ms: r.ms, from: r.from, to: r.to };
      if(!s.bestClicks || r.clicks < s.bestClicks.clicks) s.bestClicks = { clicks: r.clicks, from: r.from, to: r.to };
    }
    p.history.unshift({ t: Date.now(), from: r.from, to: r.to, outcome: r.outcome, ms: r.ms, clicks: r.clicks, party: !!r.party });
    p.history.length = Math.min(p.history.length, 30);
    save(); paintAll(); emit("stats");
    return res;
  };

  P.recordPartyWin = function(){ cur().stats.partyWins++; save(); paintAll(); emit("stats"); };

  function stat(label, value, sub){
    var d = document.createElement("div"); d.className = "stat";
    var b = document.createElement("b"); b.textContent = value;
    var l = document.createElement("span"); l.textContent = label;
    d.appendChild(b); d.appendChild(l);
    if(sub){ var s = document.createElement("small"); s.textContent = sub; d.appendChild(s); }
    return d;
  }

  function paintHeader(){ $("profileBtn").textContent = cur().name + (admin.active() ? " \u2605" : ""); }

  function adminText(){
    if(!admin.supported()) return "Admin keys need a secure page (https or localhost).";
    if(!admin.configured()) return "No admin public key is set in js/game.js yet. Generate a key below, then paste its public key into ADMIN_PUBLIC_KEYS at the top of js/game.js.";
    if(admin.active()) return "Admin mode is on. Hosts verify you automatically when you join a party.";
    if(admin.hasKey()) return "This device has a key, but its public key is not in the admin list.";
    return "No admin key on this device. Import your key file to become an admin here.";
  }

  function paintDialog(){
    var p = cur(), s = p.stats;
    if($("profName") !== document.activeElement) $("profName").value = p.name;
    var g = $("statGrid"); g.innerHTML = "";
    g.appendChild(stat("Runs finished", s.finished + " / " + s.played));
    g.appendChild(stat("Avg clicks", s.finished ? (s.totalClicks / s.finished).toFixed(1) : "\u2013"));
    g.appendChild(stat("Avg time", s.finished ? RH.fmt(s.totalMs / s.finished) : "\u2013"));
    g.appendChild(stat("Party wins", s.partyWins + " / " + s.partyRaces));
    g.appendChild(stat("Best time", s.bestMs ? RH.fmt(s.bestMs.ms) : "\u2013", s.bestMs ? s.bestMs.from + " \u2192 " + s.bestMs.to : ""));
    g.appendChild(stat("Fewest clicks", s.bestClicks ? String(s.bestClicks.clicks) : "\u2013", s.bestClicks ? s.bestClicks.from + " \u2192 " + s.bestClicks.to : ""));

    var hl = $("histList"); hl.innerHTML = "";
    p.history.slice(0, 10).forEach(function(h){
      var li = document.createElement("li"), t = document.createElement("span"), r = document.createElement("span");
      t.className = "t"; t.textContent = h.from + " \u2192 " + h.to + (h.party ? " (party)" : "");
      r.className = "ms"; r.textContent = h.outcome === "done" ? RH.fmt(h.ms) + " \u00b7 " + h.clicks + "c" : "gave up";
      if(h.outcome === "done") li.className = "goal-hit";
      li.appendChild(t); li.appendChild(r); hl.appendChild(li);
    });
    $("histEmpty").classList.toggle("hidden", p.history.length > 0);

    var pl = $("profList"); pl.innerHTML = "";
    Object.keys(db.list).forEach(function(id){
      var q = db.list[id], li = document.createElement("li"), t = document.createElement("span");
      t.className = "t"; t.textContent = q.name + (id === db.current ? " (current)" : "");
      li.appendChild(t);
      if(id !== db.current){
        var b = document.createElement("button"); b.type = "button"; b.className = "btn small"; b.textContent = "Switch";
        b.onclick = function(){ if(blocked()) return; db.current = id; save(); paintAll(); emit("switch"); };
        li.appendChild(b);
      }
      pl.appendChild(li);
    });
    $("delProfBtn").disabled = Object.keys(db.list).length < 2;
    $("newProfBtn").disabled = Object.keys(db.list).length >= MAX_PROFILES;
    $("adminState").textContent = adminText();
    $("adminOutBtn").classList.toggle("hidden", !admin.hasKey());
  }

  function paintAll(){ paintHeader(); if(!$("profileDlg").classList.contains("hidden")) paintDialog(); }

  function blocked(){
    if(P.busy && P.busy()){ $("profMsg").textContent = "Leave the party before switching, adding or deleting profiles."; return true; }
    $("profMsg").textContent = "";
    return false;
  }

  function confirmBtn(btn, label, fn){
    var armed = false, t;
    btn.onclick = function(){
      if(!armed){
        armed = true; btn.textContent = "Click again to confirm";
        t = setTimeout(function(){ armed = false; btn.textContent = label; }, 3000);
        return;
      }
      clearTimeout(t); armed = false; btn.textContent = label; fn();
    };
  }

  P.open = function(){
    opener = document.activeElement;
    $("profMsg").textContent = ""; $("profNameMsg").textContent = ""; $("adminMsg").textContent = "";
    $("profileDlg").classList.remove("hidden");
    paintDialog();
    $("profName").focus();
  };
  P.close = function(){
    $("profileDlg").classList.add("hidden");
    $("profName").value = cur().name;
    if(opener && opener.focus) opener.focus();
  };

  function download(name, text){
    try {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    } catch(e){}
  }

  db = load(); save(); paintHeader();

  $("profileBtn").onclick = P.open;
  $("profClose").onclick = P.close;
  $("profileDlg").addEventListener("mousedown", function(e){ if(e.target === this) P.close(); });
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && !$("profileDlg").classList.contains("hidden") && $("tut").classList.contains("hidden")) P.close();
  });
  $("profSave").onclick = function(){
    var r = P.setName($("profName").value);
    $("profNameMsg").textContent = r.ok ? "Saved." : r.msg;
  };
  $("profName").addEventListener("keydown", function(e){ if(e.key === "Enter") $("profSave").click(); });
  $("newProfBtn").onclick = function(){
    if(blocked()) return;
    if(Object.keys(db.list).length >= MAX_PROFILES) return;
    var p = blank();
    db.list[p.id] = p; db.current = p.id;
    save(); paintAll(); emit("switch");
    $("profName").focus(); $("profName").select();
  };
  confirmBtn($("delProfBtn"), "Delete this profile", function(){
    if(blocked() || Object.keys(db.list).length < 2) return;
    delete db.list[db.current];
    db.current = Object.keys(db.list)[0];
    save(); paintAll(); emit("switch");
  });
  confirmBtn($("resetProfBtn"), "Reset stats", function(){
    var p = cur(), b = blank(p.name);
    p.stats = b.stats; p.history = []; p.bests = {};
    save(); paintAll(); emit("stats");
  });

  $("adminGenBtn").onclick = function(){
    if(admin.hasKey() && !window.confirm("This replaces the admin key stored on this device. Continue?")) return;
    $("adminMsg").textContent = "Generating…";
    admin.generate().then(function(r){
      $("adminPub").value = r.pub;
      $("adminPubBox").classList.remove("hidden");
      download("rabbit-hole-admin-key.json", r.text);
      $("adminMsg").textContent = "Done. Your private key file was downloaded and saved on this device. Keep it secret and never upload it to GitHub. Paste the public key into js/game.js.";
      paintAll();
    }).catch(function(e){ $("adminMsg").textContent = e && e.message ? e.message : "Could not generate a key."; });
  };
  $("adminImportBtn").onclick = function(){ $("adminFile").click(); };
  $("adminFile").addEventListener("change", function(){
    var f = this.files && this.files[0], input = this;
    if(!f) return;
    if(f.size > 4000){ $("adminMsg").textContent = "That file is too large to be an admin key."; input.value = ""; return; }
    var rd = new FileReader();
    rd.onload = function(){
      admin.importText(String(rd.result)).then(function(pub){
        $("adminPub").value = pub; $("adminPubBox").classList.remove("hidden");
        $("adminMsg").textContent = "Key imported.";
        paintAll(); emit("admin");
      }).catch(function(e){ $("adminMsg").textContent = e && e.message ? e.message : "Could not read that file."; });
      input.value = "";
    };
    rd.readAsText(f);
  });
  $("adminOutBtn").onclick = function(){
    admin.clear(); $("adminPubBox").classList.add("hidden"); $("adminMsg").textContent = "Admin key removed from this device.";
    paintAll(); emit("admin");
  };
  $("adminPubCopy").onclick = function(){
    var b = this;
    if(navigator.clipboard) navigator.clipboard.writeText($("adminPub").value).then(function(){ b.textContent = "Copied!"; setTimeout(function(){ b.textContent = "Copy public key"; }, 1500); }, function(){});
  };
  RH.fmt = RH.fmt || function(ms){
    ms = Math.max(0, ms || 0);
    var cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000);
    return m + ":" + (s < 10 ? "0" : "") + s + "." + (cs < 10 ? "0" : "") + cs;
  };
})();

(function(){
  var API = "https://en.wikipedia.org/w/api.php";
  var POOL = ["Pizza","Albert Einstein","Moon","Ancient Rome","Association football","Guitar","Volcano","Chocolate","Titanic","Cat","Mount Everest","Electricity","Leonardo da Vinci","Coffee","Jazz","Dinosaur","Great Pyramid of Giza","Japan","Bicycle","Great white shark","Bitcoin","Napoleon","Oxygen","Olympic Games","Vampire","Pacific Ocean","Telescope","William Shakespeare","Hamburger","Sahara","Penguin","Internet","World War II","Basketball","Chess","Rainbow","Sushi","Solar System","Wolfgang Amadeus Mozart","Amazon River","Honey","Tornado","Elephant","Brazil","Vincent van Gogh","Lightning","Bread"];
  var $ = function(id){ return document.getElementById(id); };
  var RH = window.RH, PROF = RH.profiles, ADMIN = RH.admin;

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

  var from, to, clicks = 0, path = [], acc = 0, last = 0, running = false, raf = 0, busy = false, ended = true, recorded = true, scored = true;
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
  function record(outcome, ms){
    if(recorded) return { newTime: false, newClicks: false };
    recorded = true;
    return PROF.recordRun({ from: from, to: to, outcome: outcome, ms: Math.round(ms), clicks: clicks, party: !!(party && party.joined) });
  }
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
    var b = f && t ? PROF.bestFor(f, t) : null;
    $("bestLine").textContent = b ? "Your best on this route: " + fmt(b.ms) + " \u00b7 fewest clicks: " + b.clicks : "";
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
    clicks = 0; path = []; acc = 0; running = false; busy = false; ended = false; recorded = false; scored = false;
    $("clicks").textContent = "0"; $("timer").textContent = fmt(0);
    $("goalTitle").textContent = to;
    var tl = $("targetLink"); tl.href = "https://en.wikipedia.org/wiki/" + encodeURIComponent(to.replace(/ /g, "_"));
    $("setup").classList.add("hidden"); $("game").classList.remove("hidden");
    document.body.classList.add("ingame");
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
    var res = record("done", ms);
    $("pb").classList.toggle("hidden", !(res.newTime || res.newClicks));
    $("win").classList.remove("hidden");
    $("againBtn").focus(); renderBoard();
  }

  function home(){
    stopClock(); cancelAnimationFrame(raf);
    ended = true;
    stopSpectate(true);
    document.body.classList.remove("ingame");
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

  function myName(){ return PROF.current().name; }
  function paintWho(){ $("whoName").textContent = PROF.current().name + (ADMIN.active() ? " \u2605" : ""); }
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

  function cleanJoinName(n, isAdmin){
    var s = RH.cleanName(n);
    return (!s || RH.censor(s) !== s || (!isAdmin && RH.reserved(s))) ? randName() : s;
  }

  function cleanPlayer(x){
    var st = ["idle", "racing", "done", "gaveup"];
    return {
      id: String(x && x.id || "").slice(0, 64),
      name: RH.cleanName(x && x.name) || "Player",
      host: !!(x && x.host),
      ready: !!(x && x.ready),
      admin: !!(x && x.admin),
      muted: !!(x && x.muted),
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
    var finishers = l.filter(function(x){ return x.status === "done"; }).sort(function(a, b){ return a.ms - b.ms; });
    var winner = finishers.length ? finishers[0].id : null;
    var n = l.filter(function(x){ return !x.admin && x.status !== "idle"; }).length;
    broadcast({ t: "roundover", winner: winner, n: n });
    onRoundOver(winner, n);
    hostSys(p, "Round over.");
  }

  function onRoundOver(winner, n){
    if(scored || !party || !winner || winner !== party.me || n < 2) return;
    scored = true;
    PROF.recordPartyWin();
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

  function isMod(){
    var me = party && party.joined && party.players[party.me];
    return !!party && party.joined && (party.isHost || !!(me && me.admin));
  }

  function fillBoard(ol, list, withMod){
    ol.innerHTML = "";
    ranked(list).forEach(function(p){
      var li = document.createElement("li"), n = document.createElement("span"), c = document.createElement("span"), s = document.createElement("span");
      n.className = "t"; n.textContent = (p.admin ? "\u2605 " : "") + p.name + (p.host ? " (host)" : "") + (party && p.id === party.me ? " (you)" : "") + (p.muted ? " (muted)" : "");
      c.className = "ms"; c.textContent = p.clicks + (p.clicks === 1 ? " click" : " clicks");
      s.className = "ms"; s.textContent = p.status === "done" ? "\u2713 " + fmt(p.ms) : (p.status === "gaveup" ? "gave up" : (p.status === "racing" ? "racing" : "waiting"));
      if(p.status === "done") li.className = "goal-hit";
      li.appendChild(n); li.appendChild(c); li.appendChild(s);
      if(withMod && !p.host && !p.admin && party && p.id !== party.me){
        var mu = document.createElement("button"), rm = document.createElement("button");
        mu.type = "button"; mu.className = "btn small"; mu.textContent = p.muted ? "Unmute" : "Mute";
        mu.onclick = function(){ modAction("mute", p.id, !p.muted); };
        rm.type = "button"; rm.className = "btn small danger"; rm.textContent = "Remove";
        rm.onclick = function(){ modAction("kick", p.id); };
        li.appendChild(mu); li.appendChild(rm);
      }
      ol.appendChild(li);
    });
  }

  function renderBoard(){
    var joined = !!party && party.joined;
    var meP = joined && party.players[party.me];
    if(meP && !ended && meP.status === "gaveup" && !$("game").classList.contains("hidden")) giveUp();
    var inGame = joined && !$("game").classList.contains("hidden");
    $("boardPanel").classList.toggle("hidden", !inGame);
    $("standings").classList.toggle("hidden", !joined);
    $("solveStandings").classList.toggle("hidden", !joined);
    if(joined){
      var l = plist();
      var mod = isMod();
      fillBoard($("board"), l, mod); fillBoard($("standingsList"), l, mod); fillBoard($("solveStandingsList"), l, mod);
      $("endRoundBtn2").classList.toggle("hidden", !(mod && party.state === "playing"));
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
    document.body.classList.add("ingame");
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

  function sendPointer(cx, cy){
    if(!party || !party.joined || !watched || ended || spectating) return;
    var now = performance.now();
    if(now - lastMouse < 80) return;
    lastMouse = now;
    var w = document.querySelector(".artwrap"), r = w.getBoundingClientRect();
    if(!r.width) return;
    var x = Math.round(Math.min(1, Math.max(0, (cx - r.left) / r.width)) * 1000) / 1000;
    var y = Math.round(Math.max(0, cy - r.top));
    if(party.isHost) forwardMouse(party, party.me, x, y);
    else sendTo(party.hostConn, { t: "mouse", x: x, y: y });
  }

  function touchPoint(e){
    var t = e.touches && e.touches[0];
    if(t) sendPointer(t.clientX, t.clientY);
  }

  document.addEventListener("mousemove", function(e){ sendPointer(e.clientX, e.clientY); });
  document.addEventListener("touchstart", touchPoint, { passive: true });
  document.addEventListener("touchmove", touchPoint, { passive: true });

  var REACTIONS = [["\ud83d\udc4f", "Clap"], ["\ud83d\udd25", "Fire"], ["\ud83d\ude02", "Laugh"], ["\ud83d\ude2e", "Wow"], ["\ud83d\udc80", "Skull"], ["\ud83d\udc40", "Eyes"]];
  var REACT_GAP = 500, REACT_BURST = 8, lastReact = 0;

  function validReaction(e){
    return typeof e === "string" && REACTIONS.some(function(r){ return r[0] === e; });
  }

  function showReaction(e, name){
    if(!validReaction(e)) return;
    var layer = $("reactLayer");
    while(layer.children.length >= 14) layer.removeChild(layer.firstChild);
    var d = document.createElement("div"), s = document.createElement("small");
    d.className = "react";
    d.style.left = (8 + Math.random() * 78) + "%";
    d.appendChild(document.createTextNode(e));
    s.textContent = RH.cleanName(name) || "Player";
    d.appendChild(s);
    layer.appendChild(d);
    setTimeout(function(){ if(d.parentNode) d.parentNode.removeChild(d); }, 2600);
  }

  function hostReact(p, id, e){
    var pl = p.players[id], meta = p.meta[id], target = p.watch[id];
    if(!pl || !meta || !target || pl.muted || !validReaction(e)) return;
    var now = Date.now();
    meta.react = (meta.react || []).filter(function(x){ return now - x < 10000; });
    if((meta.react.length && now - meta.react[meta.react.length - 1] < REACT_GAP) || meta.react.length >= REACT_BURST) return;
    meta.react.push(now);
    var recipients = {};
    recipients[target] = 1;
    Object.keys(p.watch).forEach(function(w){ if(p.watch[w] === target) recipients[w] = 1; });
    Object.keys(recipients).forEach(function(k){
      if(k === p.me) showReaction(e, pl.name);
      else sendTo(p.conns[k], { t: "react", e: e, from: pl.name });
    });
  }

  function sendReaction(e){
    if(!spectating || !party || !party.joined || !validReaction(e)) return;
    var now = Date.now();
    if(now - lastReact < REACT_GAP) return;
    lastReact = now;
    if(party.isHost) hostReact(party, party.me, e);
    else sendTo(party.hostConn, { t: "react", e: e });
  }

  REACTIONS.forEach(function(r){
    var b = document.createElement("button");
    b.type = "button"; b.className = "react-btn"; b.textContent = r[0]; b.setAttribute("aria-label", r[1]);
    b.onclick = function(){ sendReaction(r[0]); };
    $("reactBar").appendChild(b);
  });

  $("specBtn").onclick = function(){ startSpectate(null); };
  $("specBtn2").onclick = function(){ startSpectate(null); };
  $("specStop").onclick = function(){ stopSpectate(false); };
  $("specSel").onchange = function(){ if(spectating && this.value && this.value !== specTarget) watch(this.value); };

  var chatCollapsed = false, unread = 0;
  var narrow = window.matchMedia ? window.matchMedia("(max-width: 760px)") : null;

  function paintUnread(){
    var t = unread > 99 ? "99+" : String(unread);
    ["chatUnread", "chatJumpCount"].forEach(function(id){
      $(id).textContent = t;
      $(id).classList.toggle("hidden", unread < 1);
    });
  }

  function setChatCollapsed(v){
    chatCollapsed = !!v;
    $("chatPanel").classList.toggle("collapsed", chatCollapsed);
    $("chatToggle").setAttribute("aria-expanded", String(!chatCollapsed));
    if(!chatCollapsed){ unread = 0; paintUnread(); }
  }

  function chatAdd(name, text, sys, isAdmin){
    var ol = $("chatLog"), li = document.createElement("li");
    if(sys){
      li.className = "sys"; li.textContent = text;
    } else {
      var n = document.createElement("span"), t = document.createElement("span");
      n.className = "cn" + (isAdmin ? " admin" : ""); n.textContent = (isAdmin ? "\u2605 " : "") + name + ": ";
      t.textContent = text;
      li.appendChild(n); li.appendChild(t);
    }
    ol.appendChild(li);
    if(!sys && chatCollapsed){ unread++; paintUnread(); }
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
    if(pl.muted){ notify(p, id, "You are muted."); return; }
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
    broadcast({ t: "chat", name: pl.name, text: text, admin: !!pl.admin });
    chatAdd(pl.name, text, false, pl.admin);
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
    if(!n || RH.censor(n) !== n || (!pl.admin && RH.reserved(n))){ notify(p, id, "That name is not allowed."); return; }
    var old = pl.name;
    n = uniqueName(p, n, id);
    if(n === old) return;
    meta.lastRename = now;
    pl.name = n;
    hostSys(p, old + " is now " + n);
    pushPlayers();
  }

  function renderLobby(){
    var p = party, host = !!p && p.isHost, inLobby = !!p && p.joined, joining = !!p && !p.joined;
    var guest = inLobby && !host;
    $("partyCreate").classList.toggle("hidden", !!p);
    $("joining").classList.toggle("hidden", !joining);
    $("lobby").classList.toggle("hidden", !inLobby);
    $("chatPanel").classList.toggle("hidden", !inLobby);
    $("chatJump").classList.toggle("hidden", !inLobby);
    $("routeForm").classList.toggle("hidden", guest);
    $("wait").classList.toggle("hidden", !guest);
    $("goBtn").textContent = host ? "Start for everyone" : "Start the clock";
    if(joining) $("joinStatus").textContent = p.pending ? "Waiting for the host to let you in…" : "Connecting…";
    if(!inLobby) return;

    $("pcode").textContent = p.code;
    $("pstate").textContent = p.state === "playing" ? "Round in progress" : (p.settings.locked ? "Locked" : "Open");
    $("hostCtl").classList.toggle("hidden", !host);
    $("guestCtl").classList.toggle("hidden", !guest);
    var meL = p.players[p.me], mod = host || !!(meL && meL.admin);
    $("adminCtl").classList.toggle("hidden", !(guest && meL && meL.admin));
    $("adminLock").checked = p.settings.locked;
    $("endRoundBtn").classList.toggle("hidden", !(mod && p.state === "playing"));
    $("specLobbyBtn").classList.toggle("hidden", !(canSpectate() && !spectating));
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
      n.className = "t"; n.textContent = (pl.admin ? "\u2605 " : "") + pl.name + (pl.host ? " (host)" : "") + (pl.id === p.me ? " (you)" : "") + (pl.muted ? " (muted)" : "");
      li.appendChild(n);
      if(!pl.host && !pl.admin){
        var b = document.createElement("span"); b.className = "badge"; b.textContent = pl.ready ? "ready" : "not ready"; li.appendChild(b);
      }
      if(mod && !pl.host && !pl.admin && pl.id !== p.me){
        var mu = document.createElement("button"); mu.type = "button"; mu.className = "btn small"; mu.textContent = pl.muted ? "Unmute" : "Mute";
        mu.onclick = function(){ modAction("mute", pl.id, !pl.muted); };
        li.appendChild(mu);
        var k = document.createElement("button"); k.type = "button"; k.className = "btn small danger"; k.textContent = "Remove";
        k.onclick = function(){ modAction("kick", pl.id); };
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
      var g = l.filter(function(x){ return !x.host && !x.admin; }), r = g.filter(function(x){ return x.ready; }).length;
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
    unread = 0; paintUnread();
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

  function admit(p, r, name, isAdmin){
    var id = r.conn.peer;
    clearTimeout(r.tmo);
    r.joined = true; r.pending = false; r.seen = Date.now();
    p.conns[id] = r.conn;
    p.players[id] = { id: id, name: uniqueName(p, name, id), host: false, ready: false, admin: !!isAdmin, muted: false, clicks: 0, ms: 0, status: isAdmin && p.state === "playing" ? "gaveup" : "idle", page: "" };
    p.meta[id] = { lastRename: 0, chat: [] };
    sendTo(r.conn, { t: "welcome", id: id });
    hostSys(p, p.players[id].name + (isAdmin ? " (admin) joined." : " joined."));
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

  function handleJoin(p, id, r, m, isAdmin){
    var now = Date.now();
    p.joinLog = p.joinLog.filter(function(x){ return now - x < 10000; });
    if(p.joinLog.length >= JOIN_BURST){ dropPeer(p, id, "busy"); return; }
    p.joinLog.push(now);

    var token = typeof m.token === "string" ? m.token.replace(/[^a-z0-9]/gi, "").slice(0, 24) : "";
    if(!token){ dropPeer(p, id, "busy"); return; }
    if(p.blocked[token] && !isAdmin){ dropPeer(p, id, "kicked"); return; }
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

    if(p.state !== "lobby" && !isAdmin){ dropPeer(p, id, "inround"); return; }
    if(!wasIn && p.settings.locked && !isAdmin){ dropPeer(p, id, "locked"); return; }
    if(plist().length >= p.settings.max && !isAdmin){ dropPeer(p, id, "full"); return; }

    var name = cleanJoinName(m.name, isAdmin);
    var trusted = typeof m.key === "string" && m.key === p.key;
    if(p.settings.approve && !trusted && !wasIn && !isAdmin){
      if(Object.keys(p.pending).length >= MAX_PENDING){ dropPeer(p, id, "busy"); return; }
      clearTimeout(r.tmo);
      r.pending = true;
      var pd = p.pending[id] = { id: id, name: name, tmo: setTimeout(function(){ if(p.pending[id] === pd) dropPeer(p, id, "expired"); }, PENDING_TTL) };
      sendTo(r.conn, { t: "pending" });
      chatAdd("", name + " is asking to join.", true);
      renderLobby();
    } else admit(p, r, name, isAdmin);
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
    if(m.t === "join"){
      if(r.joined || r.pending || r.joinMsg) return;
      var ap = typeof m.adminPub === "string" ? m.adminPub.slice(0, 120) : "";
      if(ap && ADMIN.listed(ap)){
        r.joinMsg = m; r.adminPub = ap; r.nonce = ADMIN.nonce();
        sendTo(r.conn, { t: "challenge", nonce: r.nonce });
        clearTimeout(r.tmo);
        r.tmo = setTimeout(function(){
          if(p.raw[id] === r && r.joinMsg){ var jm = r.joinMsg; r.joinMsg = null; r.nonce = null; handleJoin(p, id, r, jm, false); }
        }, 4000);
        return;
      }
      handleJoin(p, id, r, m, false);
      return;
    }
    if(m.t === "proof"){
      if(!r.joinMsg || !r.nonce) return;
      var jm = r.joinMsg, nonce = r.nonce;
      r.joinMsg = null; r.nonce = null;
      clearTimeout(r.tmo);
      ADMIN.verify(r.adminPub, "rabbit-hole-admin|" + p.code + "|" + nonce, m.sig).then(function(good){
        if(p.raw[id] === r && party === p) handleJoin(p, id, r, jm, !!good);
      });
      return;
    }
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
    } else if(m.t === "react"){
      hostReact(p, id, m.e);
    } else if(m.t === "admin"){
      if(pl.admin) adminAction(p, m);
    } else if(m.t === "leave"){
      dropPeer(p, id);
    }
  }

  function adminAction(p, m){
    var a = m.action, t = typeof m.target === "string" ? m.target : null;
    if(a === "kick" || a === "mute"){
      var tp = t && p.players[t];
      if(!tp || tp.host || tp.admin) return;
      if(a === "kick"){ kick(t); return; }
      tp.muted = !!m.on;
      hostSys(p, tp.name + (tp.muted ? " was muted." : " was unmuted."));
      pushPlayers();
    } else if(a === "lock"){
      p.settings.locked = !!m.on;
      pushPlayers();
    } else if(a === "endround"){
      if(p.state !== "playing") return;
      Object.keys(p.players).forEach(function(k){ if(p.players[k].status === "racing") p.players[k].status = "gaveup"; });
      hostSys(p, "The round was ended by a moderator.");
      pushPlayers();
    }
  }

  function modAction(action, target, on){
    if(!party || !party.joined) return;
    var m = { action: action, target: target, on: on };
    if(party.isHost) adminAction(party, m);
    else sendTo(party.hostConn, { t: "admin", action: action, target: target, on: on });
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
      p.players[id] = { id: id, name: name, host: true, ready: true, admin: ADMIN.active(), muted: false, clicks: 0, ms: 0, status: "idle", page: "" };
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
    if(m.t === "challenge"){
      if(typeof m.nonce !== "string" || m.nonce.length > 60 || !ADMIN.active()) return;
      ADMIN.sign("rabbit-hole-admin|" + p.code + "|" + m.nonce).then(function(sig){
        if(party === p) sendTo(p.hostConn, { t: "proof", sig: sig });
      }).catch(function(){});
      return;
    }
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
      else chatAdd(RH.cleanName(m.name) || "Player", text, false, !!m.admin);
    } else if(m.t === "notice"){
      var nt = RH.cleanText(m.text, 140);
      if(nt) chatAdd("", nt, true);
    } else if(m.t === "react"){
      showReaction(m.e, m.from);
    } else if(m.t === "roundover"){
      onRoundOver(typeof m.winner === "string" ? m.winner : null, m.n | 0);
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
        conn.send({ t: "join", name: name, key: k, token: TOKEN, adminPub: ADMIN.active() ? ADMIN.pub() : "" });
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
    record("gaveup", elapsed());
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

  paintWho();
  setChatCollapsed(!!(narrow && narrow.matches));
  $("chatToggle").onclick = function(){ setChatCollapsed(!chatCollapsed); };
  $("chatJump").onclick = function(){
    setChatCollapsed(false);
    var panel = $("chatPanel");
    if(panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  window.addEventListener("resize", setBarH);
  if(/^https?:$/.test(location.protocol)) store.set("rabbit-hole:home", location.pathname.replace(/[^\/]*$/, ""));
  PROF.busy = function(){ return !!party; };
  PROF.onChange(function(kind){
    paintWho(); updateBest();
    if(kind !== "name" || !party || !party.joined) return;
    var n = PROF.current().name;
    if(party.isHost) handleRename(party, party.me, n);
    else sendTo(party.hostConn, { t: "rename", name: n });
  });
  $("whoEdit").onclick = PROF.open;
  $("specLobbyBtn").onclick = function(){ startSpectate(null); };
  $("endRoundBtn").onclick = function(){ modAction("endround"); };
  $("endRoundBtn2").onclick = function(){ modAction("endround"); };
  $("adminLock").onchange = function(){ modAction("lock", null, this.checked); };

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
    $("joinBtn").focus();
  }
})();

(function(){
  var $ = function(id){ return document.getElementById(id); };
  var KEY = "rabbit-hole:tutorial";
  var index = 0, opener = null;

  function seen(){ try { return localStorage.getItem(KEY) === "1"; } catch(e){ return false; } }
  function markSeen(){ try { localStorage.setItem(KEY, "1"); } catch(e){} }

  function demoLinks(){
    var d = document.createElement("p");
    d.className = "demo";
    function t(s){ d.appendChild(document.createTextNode(s)); }
    function l(s){ var a = document.createElement("span"); a.className = "l"; a.textContent = s; d.appendChild(a); }
    t("Pizza is a dish of "); l("Italian"); t(" origin made with dough, tomato and "); l("mozzarella"); t(". Plain text like this is not clickable.");
    return d;
  }

  function demoBar(){
    var d = document.createElement("p");
    d.className = "demo mono";
    d.textContent = "0:42.18    Clicks 3    Get to: Moon";
    return d;
  }

  var STEPS = [
    {
      title: "Welcome to Rabbit Hole",
      body: [
        "You start on one real Wikipedia article. Your goal is to reach a different target article.",
        "The catch: you can only travel by clicking links inside the articles."
      ]
    },
    {
      title: "Click the blue links",
      body: [
        "Only blue links inside the article text count. There is no search bar and no back button, so think about where each link leads.",
        "Every link you follow adds one click."
      ],
      demo: demoLinks
    },
    {
      title: "The clock and your clicks",
      body: [
        "The timer sits at the top and pauses while a page loads, so slow internet never costs you time.",
        "The sidebar shows your click log and a link to read about the target. It opens in a new tab and the clock keeps running.",
        "Stuck? Press Give up and the game searches for a short route you could have taken."
      ],
      demo: demoBar
    },
    {
      title: "Pick your route",
      body: [
        "Type any article name and choose a suggestion, or press Random route.",
        "Press your username in the top bar to set it and see your stats. Your best times are saved per profile in this browser.",
        "After a run you can copy a challenge link so a friend plays the exact same route."
      ]
    },
    {
      title: "Race your friends",
      body: [
        "Create a party and share the invite link. People who type only the code need the host to approve them, and the host can lock the party or remove players.",
        "Once you finish a round you can spectate anyone who is still racing and watch their mouse move. Spectators can also send emoji reactions that float up on that player's screen.",
        "Use the party chat on the left. It is plain text only and bad words are censored."
      ]
    }
  ];

  function paint(){
    var s = STEPS[index];
    $("tutStep").textContent = "Step " + (index + 1) + " of " + STEPS.length;
    $("tutTitle").textContent = s.title;
    var body = $("tutBody");
    body.innerHTML = "";
    s.body.forEach(function(line){
      var p = document.createElement("p");
      p.textContent = line;
      body.appendChild(p);
    });
    if(s.demo) body.appendChild(s.demo());
    var dots = $("tutDots");
    dots.innerHTML = "";
    STEPS.forEach(function(x, i){
      var d = document.createElement("i");
      if(i === index) d.className = "on";
      dots.appendChild(d);
    });
    $("tutBack").disabled = index === 0;
    $("tutNext").textContent = index === STEPS.length - 1 ? "Let's go" : "Next";
  }

  function open(){
    opener = document.activeElement;
    index = 0;
    paint();
    $("tut").classList.remove("hidden");
    $("tutNext").focus();
  }

  function close(){
    markSeen();
    $("tut").classList.add("hidden");
    if(opener && opener.focus) opener.focus();
  }

  function next(){
    if(index >= STEPS.length - 1){ close(); return; }
    index++; paint();
  }

  function back(){
    if(index > 0){ index--; paint(); }
  }

  $("tutNext").onclick = next;
  $("tutBack").onclick = back;
  $("tutSkip").onclick = close;
  $("helpBtn").onclick = open;
  document.addEventListener("keydown", function(e){
    if($("tut").classList.contains("hidden")) return;
    if(e.key === "Escape") close();
    else if(e.key === "ArrowRight") next();
    else if(e.key === "ArrowLeft") back();
  });

  if(!seen()) open();
})();
