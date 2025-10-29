(function(){
  function onReady(){
    // Mark as ready when all resources are loaded (after other deferred scripts ran)
    document.body.classList.add('ready');
  }
  if (document.readyState === 'complete') onReady();
  else window.addEventListener('load', onReady);
})();
