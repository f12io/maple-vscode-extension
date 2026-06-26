<script>
  let isActive = true;
</script>

<div class="bgc-green-500 p-4">
  <span class:c-white={isActive} class:c-gray-500={!isActive}>
    Svelte Example
  </span>
  <button class={isActive ? 'bgc-red-500' : 'bgc-gray-300'}> Click Me </button>
</div>
