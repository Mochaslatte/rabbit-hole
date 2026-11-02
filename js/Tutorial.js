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
        "Your best time on each route is saved in this browser. After a run you can copy a challenge link so a friend plays the exact same route."
      ]
    },
    {
      title: "Race your friends",
      body: [
        "Create a party and share the invite link. People who type only the code need the host to approve them, and the host can lock the party or remove players.",
        "Once you finish a round you can spectate anyone who is still racing and watch their mouse move.",
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
