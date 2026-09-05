Component({
  properties: {
    type: {
      type: String,
      value: 'loading',
    },
    title: {
      type: String,
      value: '',
    },
    description: {
      type: String,
      value: '',
    },
    actionText: {
      type: String,
      value: '重试',
    },
  },

  methods: {
    handleAction() {
      this.triggerEvent('action');
    },
  },
});
