<template>
  <div>
    <composant surname="Tristan" :name="userName" :fullName="fullName">
      ...
    </composant>
  </div>
</template>
<script>
import Component from "/dir/composant.vue"
export default {
  components: {
    "composant": Component,
  },
  data() {
    return {
      userName: "Lieberherr",
    }
  },
  methods: {
    componentClicked() { console.log("I was clicked !") },
  },
  computed: {
    fullName() { return "Tristan " + this.userName },
  },
  watch: {
    userName() { console.log("userName changed : ", this.userName) },
  },
}
</script>
<style>
.div {
  max-width: 80%;
  background: white;
}
</style>