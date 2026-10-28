(function(){
  var themeSelect = document.getElementById("themeSelect");
  var themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(mode){
    document.documentElement.setAttribute("data-theme",mode === "system" ? (themeMedia.matches ? "dark" : "light") : mode);
  }
  var savedTheme = "system";
  try { savedTheme = localStorage.getItem("rabbit-hole:theme") || "system"; } catch(e){}
  if(["system","light","dark"].indexOf(savedTheme)<0) savedTheme="system";
  themeSelect.value=savedTheme;
  applyTheme(savedTheme);
  themeSelect.addEventListener("change",function(){
    applyTheme(this.value);
    try { localStorage.setItem("rabbit-hole:theme",this.value); } catch(e){}
  });
  if(themeMedia.addEventListener) themeMedia.addEventListener("change",function(){if(themeSelect.value==="system")applyTheme("system");});
  else if(themeMedia.addListener) themeMedia.addListener(function(){if(themeSelect.value==="system")applyTheme("system");});

})();
