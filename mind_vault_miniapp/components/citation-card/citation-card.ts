Component({
  properties: {
    citation: {
      type: Object,
      value: {},
    },
  },

  methods: {
    openSource() {
      const citation = this.properties.citation as { documentId?: string };
      if (!citation?.documentId) return;
      wx.navigateTo({
        url: `/pages/document-detail/document-detail?id=${citation.documentId}`,
      });
    },
  },
});
