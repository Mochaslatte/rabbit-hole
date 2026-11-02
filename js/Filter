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
