<?php
$isActive = true;
$extraClass = "p-4";
?>

<div class="bgc-green-500 <?= $extraClass ?>">
  <span class="<?= $isActive ? 'c-white' : 'c-gray-500' ?>">
      PHP Example
  </span>
  <button class="<?= $isActive ? 'bgc-red-500' : 'bgc-gray-300' ?> fw-bold">
      Click Me
  </button>
</div>
