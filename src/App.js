Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    mixins: {
        observable: 'Ext.util.Observable',
        maskable: 'Rally.ui.mask.Maskable'
    },

    scopeType: 'release',
    componentCls: 'app',

    //config: {
      //defaultSettings: {
        //storyCardsPerColumn: 5
      //}
    //},

    stories: null,
    features: null,
    initiatives: null,

    layout: {
      type: 'vbox'
    },

    constructor: function (config) {
      this.callParent([config]);
      this.mixins.observable.constructor.call(this, config);
      //this.mixins.maskable.constructor.call(this, {maskMsg: 'Loading...'});

      this.addEvents('load');
    },

    addContent: function(tb) {
      var me = this;

      me.on('load', function (projects, initiatives, features, stories) {
        console.log('loaded');
        me._onLoad(projects, initiatives, features, stories);
      });

      me.onScopeChange(tb);
    },

    onScopeChange: function (tb) {
      var me = this;
      console.log('Scope changed');

      me.initiatives = null;
      me.features = null;
      me.stories = null;
      me.projects = null;

      me.removeAll(true);
      me.loadData(tb);
    },

    loadData: function (tb) {
      var me = this;

      me.showMask();

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'PortfolioItem/Feature',
        fetch: true,
        filters: tb.getQueryFilter(),
        listeners: {
          load: me._featuresLoaded,
          scope: me
        }
      }).load();

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'HierarchicalRequirement',
        fetch: true,
        filters: [{
          property: 'Feature.Release.Name',
          value: tb.getRecord().get('Name')
        }, {
          property: 'Feature.Release.ReleaseStartDate',
          value: tb.getRecord().raw.ReleaseStartDate
        }, {
          property: 'Feature.Release.ReleaseDate',
          value: tb.getRecord().raw.ReleaseDate
        }, {
          property: 'DirectChildrenCount',
          value: 0
        }],
        listeners: {
          load: me._storiesLoaded,
          scope: me
        }
      }).load();

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'Project',
        fetch: true,
        listeners: {
          load: me._projectsLoaded,
          scope: me
        }
      }).load();
    },

    _projectsLoaded: function (store, recs, success) {
      var me = this;
      //var pis = {};

      //Ext.Array.each([__PROJECT_OIDS_IN_SCOPE__], function (elt) {
        //pis[elt] = 1;
      //});

      me.projects = {};

      Ext.Array.each(recs, function (elt) {
        //if ((elt.get('Children').length === 0) && (pis.hasOwnProperty(elt.get('ObjectID')))) {
        me.projects[elt.get('ObjectID')] = elt;
        //}
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _featuresLoaded: function (store, recs, success) {
      var initiatives = {};
      var query       = [];
      var me          = this;

      me.features     = {};

      Ext.Array.each(recs, function(elt) {
        if (elt.get('Parent')) {
          initiatives[Rally.util.Ref.getOidFromRef(elt.get('Parent')._ref)] = 1;
        }
        me.features[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      Ext.Object.each(initiatives, function(key) {
        query.push({property: 'ObjectID', operator: '=', value: key});
      });

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'PortfolioItem/Initiative',
        filters: query,
        fetch: true,
        listeners: {
          load: me._initiativesLoaded,
          scope: me
        }
      }).load();

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _storiesLoaded: function (store, recs, success) {
      var me     = this;
      me.stories = {};

      Ext.Array.each(recs, function(elt) {
        me.stories[parseInt(elt.get('ObjectID') + '', 10)] = elt;

      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _initiativesLoaded: function (store, recs, success) {
      var me         = this;
      me.initiatives = {};

      Ext.Array.each(recs, function(elt) {
        me.initiatives[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _onLoad: function (projects, initiatives, features, stories) {
      var me = this;

      me.hideMask();
      console.log(me);

      me.projectByStory      = {};
      me.projectByFeature    = {};
      me.projectByInitiative = {};

      me.storyByProject      = {};
      me.featureByProject    = {};
      me.initiativeByProject = {};

      Ext.Object.each(stories, function (oid, story) {
        var featureOid    = Rally.util.Ref.getOidFromRef(story.get('Feature')._ref);
        var initiativeOid = Rally.util.Ref.getOidFromRef(features[featureOid].get('Parent')._ref);
        var projectOid    = Rally.util.Ref.getOidFromRef(story.get('Project')._ref);

        me.projectByStory[oid]                = projectOid;
        me.projectByFeature[featureOid]       = projectOid;
        me.projectByInitiative[initiativeOid] = projectOid;

        me.storyByProject[projectOid]      = me.storyByProject[projectOid] || {};
        me.featureByProject[projectOid]    = me.featureByProject[projectOid] || {};
        me.initiativeByProject[projectOid] = me.initiativeByProject[projectOid] || {};

        me.storyByProject[projectOid][oid]                = 1;
        me.featureByProject[projectOid][featureOid]       = 1;
        me.initiativeByProject[projectOid][initiativeOid] = 1;
      });

      Ext.Object.each(me.storyByProject, function (projectId, stories) {
        console.log('Adding project', projectId, me.projects[projectId].get('Name'));
        me.add(me.addProject(projectId));
      });
    },

    addProject: function (projectId) {
      var me = this;

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        },
        items: [{
          xtype: 'box',
          //cls: 'rotate',
          //width: '48px',
          //height: '200px',
          html: me.projects[projectId].get('Name')
        }]
      });

      Ext.Object.each(me.initiativeByProject[projectId], function (initiativeId) {
        container.add(me.addInitiative(projectId, initiativeId));
      });

      return container;
    },

    addInitiative: function (projectId, initiativeId) {
      var me = this;
      var iid;

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox'
        },
        items: [{
          xtype: 'box',
          html: me.initiatives[initiativeId].get('Name')
        }]
      });

      Ext.Object.each(me.featureByProject[projectId], function (featureId) {
        iid = Rally.util.Ref.getOidFromRef(me.features[featureId].get('Parent')._ref);

        if (initiativeId === iid) {
          container.add(me.addFeature(projectId, initiativeId, featureId));
        }
      });

      return container;
    },

    addFeature: function (projectId, initiativeId, featureId) {
      var me      = this;
      var i       = 0;
      var spc     = 5; //me.getSettings('storiesPerColumn');
      var bgColor = me.initiatives[initiativeId].get('DisplayColor');

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox'
        },
        items: [{
          xtype: 'box',
          style: 'background-color: #' + bgColor,
          html: me.features[featureId].get('Name')
        }]
      });

      return container;
    },

    addStory: function (featureId, storyId) {
    }

});
