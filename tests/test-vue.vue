<template>
  <div class="bgc-green-500 p-4">
    <span :class="{ 'c-white': isActive, 'c-gray-500': !isActive }">
      Vue Example
    </span>
    <button :class="[isActive ? 'bgc-red-500' : 'bgc-gray-300']">
      Click Me
    </button>
  </div>
</template>

<script>
export default {
  data() {
    return { isActive: true };
  },
};
</script>
