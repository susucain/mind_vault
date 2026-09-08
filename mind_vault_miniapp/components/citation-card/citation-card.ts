Component({
  properties: {
    citation: {
      type: Object,
      value: {},
    },
  },

  methods: {
    openSource() {
      const citation = this.properties.citation as {
        documentId?: string;
        quote?: string;
        locator?: Record<string, unknown>;
      };
      if (!citation?.documentId) return;
      const locator = encodeURIComponent(
        JSON.stringify(citation.locator ?? {})
      );
      const quote = encodeURIComponent(citation.quote ?? '');
      wx.navigateTo({
        url: `/pages/document-detail/document-detail?id=${citation.documentId}&locator=${locator}&quote=${quote}&from=chat`,
      });
    },
  },
});
