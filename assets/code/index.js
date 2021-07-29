import Vue from 'vue'
import Vuex from 'vuex'
import axios from 'axios'
import Echo from 'laravel-echo'
import menu from './modules/menu'
Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    user: JSON.parse(document.querySelector("meta[type='user']").getAttribute("value")),
    jobs: [],
    unassignedJobs: [],
    formData: {
      dialog: false,
      initialJob: null,
    },
  },

  mutations: {
    /*Jobs*/
    setJobs(state, value) { state.jobs = value },
    setUnassignedJobs(state, value) { state.unassignedJobs = value },
    addOrUpdateJob(state, value) {
      if (!Array.isArray(value)) value = [value]
      value.forEach(element => {
        let index = state.jobs.findIndex(job => job.id == element.id)
        if (index != -1) {//If the job exists, the new timeline, files and messages are appended to the existing ones
          let timeline = element.timeline ? state.jobs[index].timeline.concat(element.timeline) : state.jobs[index].timeline
          let files = element.files ? state.jobs[index].files.concat(element.files) : state.jobs[index].files
          let messages = state.jobs[index].messages
          Object.assign(state.jobs[index], element)
          state.jobs[index].timeline = timeline
          state.jobs[index].files = files
          state.jobs[index].messages = messages
        }
        else {//If it doesn't, it is added in the jobs array
          state.jobs.unshift(element)
        }
      })
    },
    addOrRemoveUnassignedJob(state, value) {
      if (!Array.isArray(value)) value = [value]
      value.forEach(element => {
        if (!element.technician_id) {//If the job in unassigned, it is added to the unassigned jobs array
          state.unassignedJobs.unshift(element)
        }
        else {//If it is, it is removed from the unassigned jobs array
          let index = state.unassignedJobs.findIndex(job => job.id == element.id)
          if (index != -1) state.unassignedJobs.splice(index, 1)
        }
      })
    },
    removeJob(state, value) {
      let index = state.jobs.findIndex(job => job.id == value.id)
      if (index != -1) state.jobs.splice(index, 1)
    },

    /*Messages*/
    addMessage(state, value) {
      let job = this.getters.getJobs.find(job => job.id == value.job_id)
      job.messages.push(value)
      if (this.getters.getUser.id == value.recipient_id) this.getters.getUser.is_technician ? job.notify_technician = true : job.notify_client = true
    },

    /*User*/
    setUser(state, value) { state.user = value },
  },


  getters: {
    getJobs: state => state.jobs,
    getUnassignedJobs: state => state.unassignedJobs,
    getNotifications: state => state.jobs.filter(job => state.user.is_technician ? job.notify_technician : job.notify_client).length,
    getUser: state => state.user,
    getFormData: state => state.formData,
  },


  actions: {
    pusherConnect() {
      window.Pusher = require('pusher-js')
      window.Echo = new Echo({
        broadcaster: 'pusher',
        key: '23d1749ad2b7bf6d3315',
        wsHost: window.location.hostname,
        wsPort: 6001,
        wssPort: 6001,
        forceTLS: true,
        disableStats: true,
        encrypted: true,
        enabledTransports: ['ws', 'wss'],
      })
      let id = this.state.user.id
      window.Echo.channel('message.channel.' + id).listen('MessagePusherEvent', (e) => {
        this.commit("addMessage", e.message)
      })
      window.Echo.channel('job.channel.' + id).listen('JobPusherEvent', (e) => {
        if ('terminated' in e.job) this.commit("removeJob", e.job)
        else this.commit("addOrUpdateJob", e.job)
      })
      if (this.state.user.is_technician) {
        window.Echo.channel('job.channel.0').listen('JobPusherEvent', (e) => {
          this.commit("addOrRemoveUnassignedJob", e.job)
        })
      }
    },

    /*Messages*/
    sendMessage({ commit }, payload) {  //Uploads a message ->payload: {jobId: the job's ID, text: the message text}
      return axios
        .post("/api/message/store", { job_id: payload.jobId, text: payload.text, })
        .then((response) => {
          this.commit("addMessage", response.data)
        })
    },

    /*Jobs*/
    retrieveJobs({ commit }) { //Retrieves all of user's jobs from the database. The returned array contains the files and the timeline events of each job
      return axios
        .get("/api/jobs/" + this.getters.getUser.id)
        .then((response) => {
          this.commit("setJobs", response.data)
        })
    },
    retrieveUnassignedJobs({ commit }) {  //Retrieves all unassigned jobs. Available to the technicians
      return axios
        .get("/api/jobs/0")
        .then((response) => {
          this.commit("setUnassignedJobs", response.data)
        })
    },
    updateJobStatus({ commit }, payload) {  //Updates the status of a job ->payload: {id: job's id, status: the new status}
      return axios
        .post("/api/job/update-status", { id: payload.id, status: payload.status })
        .then((response) => {
          this.commit("addOrUpdateJob", response.data)
        })
    },
    updateJobNotify({ commit }, payload) { //Sets the job's status_alert to false  ->payload: job's id
      return axios
        .post("/api/job/update-notify", { id: payload })
        .then((response) => {
          this.commit("addOrUpdateJob", response.data)
        })
    },
    storeJob({ commit }, payload) {  //Creates a new job/files in the database ->payload: {job: the new job, files: array of associated files}
      let formData = new FormData()
      formData.append('client_id', payload.job.clientId)
      formData.append('job_type', payload.job.jobType)
      formData.append('deadline', payload.job.deadline.toJSON())
      formData.append('description', payload.job.description)
      payload.files.forEach(file => {
        formData.append('uploadedFiles[]', file)
      })
      return axios
        .post("/api/job/store", formData)
        .then((response) => {
          this.commit("addOrUpdateJob", response.data)
        })
    },
    clearAllNotify({ commit }, payload) {  //Locally sets all job's "notify_(client/technician)" to false. Use updateJobNotify() to do it server side ->payload: job's id
      let job = state.jobs.find(job => job.id == payload)
      job.messages.forEach(element => {
        element.notify = false
      })
      job.timeline.forEach(element => {
        this.getters.getUser.is_technician ? element.notify_technician = false : element.notify_client = false
      })
    },
    assignJob({ commit }, payload) {  //Assigns the job's technician_id ->payload: [job's IDs]
      return axios
        .post("/api/job/assign", { idArray: payload })
        .then((response) => {
          this.commit("addOrUpdateJob", response.data)
        })
    },
    terminateJob({ commit }, payload) { //Terminates the job by soft-deleting it  ->payload: {id: job's id, rating: job rating}
      return axios
        .post("/api/job/terminate", { id: payload.id, rating: payload.rating })
        .then((response) => {
          this.commit("removeJob", response.data)
        })
    },

    /*Files*/
    storeFiles({ commit }, payload) {  //Creates new files in the database ->payload: {id: job's ID, files: array of files}
      let formData = new FormData()
      formData.append('job_id', payload.id)
      payload.files.forEach(file => {
        formData.append('uploadedFiles[]', file)
      })
      return axios.post("/api/file/store", formData)
        .then((response) => {
          //console.log(response.data)
          this.commit("addOrUpdateJob", response.data)
        })
    },
    downloadFile({ commit }, payload) { //Downloads a stored file ->payload: file's id
      return axios.get("/api/file/download/" + payload, { responseType: 'arraybuffer' })
    },

    /*User*/
    logout({ commit }) {  //Self-explanatory
      return axios
        .post("/api/user/logout")
    },
    updateSettings({ commit }, payload) { //Updates the database values of the user's settings ->payload : [{name: property name, value: true/false}]
      return axios
        .post("/api/user/update-settings", { fields: payload })
        .then((response) => {
          this.commit("setUser", response.data)
        })
    },
    retrieveUser({ commit }) {  //Retrieves the user's infos
      return axios
        .get("/api/user/retrieve")
        .then((response) => {
          this.commit("setUser", response.data)
        })
    },

    /*Others*/
    openJobForm({ commit }, payload) {
      this.state.formData.dialog = true
      this.state.formData.initialJob = payload
    },
    closeJobForm({ commit }) {
      this.state.formData.dialog = false
    },
  },

  modules: {
    menu,
  }
})