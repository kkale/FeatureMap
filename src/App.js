var Ext = window.Ext4 || window.Ext;

Ext.define('Rally.print.FeatureMap', {
  requires: ['Ext.XTemplate'],
  extend: 'Rally.ui.plugin.print.Print',
  alias: 'plugin.featuremapprinting',

  init: function(component){
    //console.log('Initializing Printing');
    this.callParent(arguments);
    this.component = component;
  },

  _getHtmlContent: function(dom) {
    var el = Ext.DomHelper.createDom({});
    var main = Ext.clone(dom.dom);
    Ext.fly(main).setHeight('100%');
    Ext.Array.each(Ext.query('div.x-box-inner', main), function (box) {
      Ext.fly(box).setWidth(parseInt(box.style.width, 10) + 10);
      Ext.fly(box).setLeft(parseInt(box.style.left, 10) + 15);
      //console.log(box.style.width, typeof box.style.width, parseInt(box.style.width, 10));
    });

    Ext.Array.each(Ext.query('//link[rel="stylesheet"]', dom), function (link) {
      //console.log("Adding link", link);
      el.appendChild(link);
    });
    el.appendChild(Ext.clone(Ext.query("#appCss")[0]));
    el.appendChild(main);
    //console.log('Printing', el);
    return el.innerHTML;
  },

  getContent: function() {
    return this._getHtmlContent(this.component.getEl());
  },

  getHeader: function() {
    return '';
  }
});

Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    mixins: {
        observable: 'Ext.util.Observable',
        maskable: 'Rally.ui.mask.Maskable'
    },

    plugins: [{
      ptype: 'featuremapprinting',
      pluginId: 'print'
    }],

    scopeType: 'release',
    componentCls: 'app',
    settingsScope: 'workspace',
    autoScroll: true,

    scheduleStates: ['Backlog', 'Defined', 'In-Progress', 'Completed', 'Accepted', 'Released'],

    config: {
      defaultSettings: {
        storyCardsPerColumn: 5,
        'state-color-backlog': '#E5E5E5',
        'state-color-defined': '#E5E5E5',
        'state-color-in-progress': '#FDEFA7',
        'state-color-completed': '#FDEFA7',
        'state-color-accepted': '#BFF0B8',
        'state-color-released': '#B0C9FF'
      }
    },

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

      this.addEvents('load', 'scheduleStatesLoaded');

      this.fidTemplate = Rally.nav.DetailLink;
      this.cardTemplate = new Ext.XTemplate(
        '<tpl if="color != null">',
          '<div class="card {type} state-{state}" style=\'border-top: solid 8px {color}\'>',
        '<tpl else>',
          '<div class="card {type} state-{state} {blocked}">',
        '</tpl>',
          '<p class="name">{fidLink} {name}</p>',
          '<tpl if="size"><p class="size">{size}</p></tpl>',
        '</div>'
      );
      this.headerTemplate = new Ext.XTemplate(
        '<div class="header" style="width: {width}">',
          '<div class="name"><h1>{name} - FEATURE BACKLOG</h1></div>',
          '<div class="info">',
            '{accepted} of {total} Story Points are done. ',
            '{[ values.completed - values.accepted ]} Story Points are awaiting approval. ',
            '{[ values.total - values.accepted ]} Story Points remaining. ',
            '<tpl if="notEstimated"><span style="color: red">{notEstimated} Stories are not estimated.</span></tpl>',
          '</div>',
        '</div>'
      );
    },

    getSettingsFields: function () {
      var fields = [{
        name: 'storyCardsPerColumn',
        label: 'Story Cards per Column',
        xtype: 'rallynumberfield'
      }];

      Ext.Array.each(this.scheduleStates, function (state) {
        fields.push({
          name: 'state-color-' + state.toLowerCase(),
          label: state + ' Color',
          xtype: 'rallytextfield'
        });
      });

      return fields;
    },

    getOptions: function () {
      return [{
        text: 'Print',
        handler: this.openPrintPage,
        scope: this
      }, {
        text: 'Show Color Legend',
        handler: this.showLegend,
        scope: this
      }];
    },

    showLegend: function () {
      var dlgWidth = 200;
      var me = this;

      if (!this.legendDlg) {
        var legend = [];

        Ext.Array.each(me.scheduleStates, function (state) {
          legend.push({
            xtype: 'container',
            layout: {
              type: 'hbox'
            },
            style: {
              margin: '5px'
            },
            items: [{
              xtype: 'box',
              width: 16,
              height: 16,
              style: {
                border: 'solid 1px black',
                backgroundColor: me.getSetting('state-color-' + state.toLowerCase()),
                marginRight: '5px'
              },
              html: '&nbsp'
            }, {
              xtype: 'box',
              height: 16,
              style: {
                verticalAlign: 'middle',
                display: 'table-cell',
                paddingTop: '2px'
              },
              html: ' ' + state
            }]
          });
        });

        this.legendDlg = Ext.create('Rally.ui.dialog.Dialog', {
          autoShow: true,
          draggable: true,
          width: dlgWidth,
          height: me.scheduleStates.length * 27,
          title: 'Story Color Legend',
          closable: true,
          closeAction: 'hide',
          modal: false,
          x: Ext.fly(this.getEl()).getWidth() - dlgWidth - 50,
          y: 20,
          items: legend
        });
      } else {
        this.legendDlg.show();
      }
    },

    addToContainer: function (con) {
      this.add(con);
    },

    addContent: function(tb) {
      var me = this;

      Ext.create('Rally.data.WsapiDataStore', {
        autoLoad: true,
        model: 'TypeDefinition',
        filters: [{
          property: 'TypePath',
          operator: '=',
          value: 'HierarchicalRequirement'
        }],
        fetch: ['Attributes', 'ElementName', 'AllowedValues', 'StringValue'],
        listeners: {
          load: function (store, recs) {
            //console.dir(recs);
            Ext.Array.each(recs[0].get('Attributes'), function (attribute) {
              if (attribute.ElementName !== 'ScheduleState') { return; }

              me.scheduleStates = [];
              Ext.Array.each(attribute.AllowedValues, function (value) {
                if (value.StringValue) {
                  me.scheduleStates.push(value.StringValue);
                }
              });

              me.fireEvent('scheduleStatesLoaded', me.scheduleStates);
            });
          }
        }
      });

      me.on('scheduleStatesLoaded', function (states) {
        //console.log('States', me, states);
      });

      Ext.create('Rally.data.WsapiDataStore', {
        autoLoad: true,
        remoteFilter: false,
        model: 'TypeDefinition',
        sorters: [{
          property: 'Ordinal',
          direction: 'Desc'
        }],
        filters: [{
          property: 'Parent.Name',
          operator: '=',
          value: 'Portfolio Item'
        }, {
          property: 'Creatable',
          operator: '=',
          value: 'true'
        }],
        listeners: {
          load: function (store, recs) {
            me.piTypes = {};

            Ext.Array.each(recs, function (type) {
              //console.log('Found PI Type', type, type.get('Ordinal'), type.get('TypePath'));
              me.piTypes[type.get('Ordinal') + ''] = type.get('TypePath');
            });
            me.onScopeChange(tb);
          },
          scope: me
        }
      });

      me.on('load', function (projects, initiatives, features, stories) {
        //console.log('loaded');
        me._onLoad(projects, initiatives, features, stories);
      });
    },

    onScopeChange: function (tb) {
      var me = this;
      //console.log('Scope changed');

      me.initiatives = null;
      me.features = null;
      me.stories = null;
      me.projects = null;

      me.removeAll(true);
      me.loadData(tb);
    },

    loadData: function (tb) {
      var me = this;

      me.showMask("Loading data for " + tb.getRecord().get('Name') + "...");

      Ext.create('Rally.data.WsapiDataStore', {
        model: me.piTypes['0'],
        autoLoad: true,
        fetch: ['FormattedID', 'Name', 'Value', 'Parent', 'Project', 'UserStories', 'Children', 'PreliminaryEstimate', 'DirectChildrenCount', 'LeafStoryPlanEstimateTotal'],
        filters: tb.getQueryFilter(),
        sorters: [{
          property: 'Rank',
          direction: 'ASC'
        }],
        listeners: {
          load: me._featuresLoaded,
          scope: me
        }
      });

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'HierarchicalRequirement',
        autoLoad: true,
        fetch: ['FormattedID', 'Name', 'ScheduleState', 'PlanEstimate', 'Feature', 'Parent', 'Project', 'Blocked', 'BlockedReason'],
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
        sorters: [{
          property: 'Rank',
          direction: 'ASC'
        }],
        listeners: {
          load: me._storiesLoaded,
          scope: me
        }
      });

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'Project',
        autoLoad: true,
        fetch: true,
        listeners: {
          load: me._projectsLoaded,
          scope: me
        }
      });
    },

    _projectsLoaded: function (store, recs, success) {
      //console.log('Projects loaded', recs);
      var me         = this;

      me.projects    = {};
      me.projectRecs = recs;

      Ext.Array.each(recs, function (elt) {
        me.projects[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _featuresLoaded: function (store, recs, success) {
      //console.log('Features loaded', recs);
      var me          = this;
      var initiatives = {};
      var query       = [];
      var filter      = "";

      me.features             = {};
      me.featureRecs          = recs;
      me.featuresByInitiative = {};

      Ext.Array.each(recs, function(elt) {
        var iid;

        if (!elt) {
          return;
        }

        if (elt.get('Parent') && elt.get('Parent')._ref) {
          iid = Rally.util.Ref.getOidFromRef(elt.get('Parent')._ref);
          initiatives[iid] = 1;
        } else {
          iid = 0;
        }

        me.features[parseInt(elt.get('ObjectID') + '', 10)] = elt;
        me.featuresByInitiative[iid] = me.featuresByInitiative[iid] || {};
        me.featuresByInitiative[iid][elt.get('ObjectID')] = elt;
      });

      Ext.Object.each(initiatives, function(key) {
        query.push({property: 'ObjectID', operator: '=', value: key});
      });

      if (query.length > 0) {
        filter = Rally.data.QueryFilter.or(query);
      } else {
        //console.log("No initiatives found", query);
      }

      Ext.create('Rally.data.WsapiDataStore', {
        model: me.piTypes['1'],
        autoLoad: true,
        filters: filter,
        fetch: ['FormattedID', 'Name', 'PreliminaryEstimate', 'Value', 'Children', 'Project', 'DisplayColor'],
        sorters: [{
          property: 'Rank',
          direction: 'ASC'
        }],
        listeners: {
          load: me._initiativesLoaded,
          scope: me
        }
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _storiesLoaded: function (store, recs, success) {
      //console.log('Stories loaded', recs);

      var me       = this;

      me.stories   = {};
      me.storyRecs = recs;

      Ext.Array.each(recs, function(elt) {
        me.stories[parseInt(elt.get('ObjectID') + '', 10)] = elt;

      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _initiativesLoaded: function (store, recs, success) {
      //console.log('Initiatives loaded', recs);
      var me = this;
      var nullInitiative;

      me.initiatives    = {};
      me.initiativeRecs = recs;

      Ext.Array.each(recs, function(elt) {
        me.initiatives[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      Rally.data.ModelFactory.getModel({
        type: me.piTypes['1'],
        success: function (model) {
          var blank = Ext.create(model, {
            ObjectID: 0,
            Name: '(No ' + me.piTypes['1'].split('/')[1] + ')'
          });

          me.initiatives[0] = blank;
          me.initiativeRecs.push(blank);
          if (me.stories && me.features && me.initiatives && me.projects) {
            me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
          }
        }
      });
    },

    _onLoad: function (projects, initiatives, features, stories) {
      //console.log('All data loaded. Time to process it');
      var me = this;

      me.hideMask();
      //console.log(me);

      me.projectsByStory      = {};
      me.projectsByFeature    = {};
      me.projectsByInitiative = {};

      me.storyByProject      = {};
      me.featureByProject    = {};
      me.initiativeByProject = {};

      me.totalPoints              = 0;
      me.totalCompletedPoints     = 0;
      me.totalAcceptedPoints      = 0;
      me.totalStoriesNotEstimated = 0;

      me.projectList = {};

      Ext.Object.each(stories, function (oid, story) {
        var featureOid    = Rally.util.Ref.getOidFromRef(story.get('Feature')._ref);
        var projectOid    = Rally.util.Ref.getOidFromRef(story.get('Project')._ref);
        var initiativeOid;

        if (features[featureOid].get('Parent')) {
          initiativeOid = Rally.util.Ref.getOidFromRef(features[featureOid].get('Parent')._ref);
        } else {
          initiativeOid = 0;
        }

        if (!isNaN(parseInt(story.get('PlanEstimate') + '', 10))) {
          me.totalPoints = me.totalPoints + parseInt(story.get('PlanEstimate') + '', 10);

          if ((story.get('ScheduleState') === 'Accepted') || (story.get('ScheduleState') === 'Released')) {
            me.totalAcceptedPoints = me.totalAcceptedPoints + parseInt(story.get('PlanEstimate') + '', 10);
            me.totalCompletedPoints = me.totalCompletedPoints + parseInt(story.get('PlanEstimate') + '', 10);
          } else if (story.get('ScheduleState') === 'Completed') {
            me.totalCompletedPoints = me.totalCompletedPoints + parseInt(story.get('PlanEstimate') + '', 10);
          }
        } else {
          me.totalStoriesNotEstimated++;
        }

        oid           = parseInt(oid + '', 10);
        featureOid    = parseInt(featureOid + '', 10);
        initiativeOid = parseInt(initiativeOid + '', 10);
        projectOid    = parseInt(projectOid + '', 10);

        me.projectList[projectOid] = 1;

        me.projectsByStory[oid]                = me.projectsByStory[oid] || {};
        me.projectsByFeature[featureOid]       = me.projectsByFeature[featureOid] || {};
        me.projectsByInitiative[initiativeOid] = me.projectsByInitiative[initiativeOid] || {};

        me.projectsByStory[oid][projectOid]                = 1;
        me.projectsByFeature[featureOid][projectOid]       = 1;
        me.projectsByInitiative[initiativeOid][projectOid] = 1;

        me.storyByProject[projectOid]      = me.storyByProject[projectOid] || {};
        me.featureByProject[projectOid]    = me.featureByProject[projectOid] || {};
        me.initiativeByProject[projectOid] = me.initiativeByProject[projectOid] || {};

        me.storyByProject[projectOid][oid]                = 1;
        me.featureByProject[projectOid][featureOid]       = 1;
        me.initiativeByProject[projectOid][initiativeOid] = 1;
      });

      Ext.Array.each(me.featureRecs, function (feature) {
        var featureOid    = feature.get('ObjectID');
        var projectOid    = Rally.util.Ref.getOidFromRef(feature.get('Project')._ref);
        var initiativeOid;

        if (feature.get('Parent')) {
          initiativeOid = Rally.util.Ref.getOidFromRef(feature.get('Parent')._ref);
        } else {
          initiativeOid = 0;
        }

        me.projectList[projectOid] = 1;
        me.projectsByFeature[featureOid]       = me.projectsByFeature[featureOid] || {};
        me.projectsByInitiative[initiativeOid] = me.projectsByInitiative[initiativeOid] || {};

        if (feature.get('DirectChildrenCount') !== 0) {
          return;
        }

        me.projectsByFeature[featureOid][projectOid]       = 1;
        me.projectsByInitiative[initiativeOid][projectOid] = 1;

        me.featureByProject[projectOid]    = me.featureByProject[projectOid] || {};
        me.initiativeByProject[projectOid] = me.initiativeByProject[projectOid] || {};

        me.featureByProject[projectOid][featureOid]       = 1;
        me.initiativeByProject[projectOid][initiativeOid] = 1;
      });

      me.addToContainer({
        xtype: 'box',
        layout: 'fit',
        html: me.headerTemplate.apply({
          width:        (Ext.get(me.getEl()).getWidth() - 10) + "px",
          name:         this.getContext().getTimeboxScope().getRecord().get('Name'),
          accepted:     me.totalAcceptedPoints,
          completed:    me.totalCompletedPoints,
          total:        me.totalPoints,
          notEstimated: me.totalStoriesNotEstimated
        })
      });

      Ext.Object.each(me.projectList, function (projectId, __) {
        //console.log('Adding project', projectId, me.projects[projectId].get('Name'));
        me.addToContainer(me.addProject(projectId));
      });

      var colors = {};
      Ext.Object.each(me.getSettings(), function(k, v) {
        if (k.indexOf('state-color-') !== -1) {
          colors[k.replace('state-color-', '')] = v;
        }
      });

      //console.log('Colors', colors);
      Ext.Object.each(colors, function (k, v) {
        Ext.Array.each(Ext.query('.story.state-' + k), function(elt) {
          elt.style.backgroundColor = v;
        });
      });
    },

    addProject: function (projectId) {
      //console.log('Adding project', projectId);

      var me = this;
      var cls = Ext.isIE ? 'rotate rotate-ie' : 'rotate';

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox',
          align: 'stretchmax'
        },
        items: [{
          xtype: 'box',
          cls: Ext.isIE ? 'rotate-parent' : 'rotate-parent',
          html: '<div class="' + cls + '">' + me.projects[projectId].get('Name') + '</div>'
        }]
      });

      Ext.Array.each(me.initiativeRecs, function (initiative) {
        var initiativeId = initiative.data.ObjectID + '';

        if (me.projectsByInitiative[initiativeId]) {
          if (me.projectsByInitiative[initiativeId][projectId]) {
            container.add(me.addInitiative(projectId, initiativeId));
          }
        }
      });

      return container;
    },

    addInitiative: function (projectId, initiativeId) {
      //console.log('Adding initiative', initiativeId);

      var me = this;
      var data = {};
      var iid;

      //console.log('Initiative', initiativeId, me.initiatives[initiativeId]);

      if (!me.initiatives[initiativeId]) { return; }

      data.type    = 'initiative';
      data.name    = me.initiatives[initiativeId].get('Name');
      data.fidLink = me.fidTemplate.getLink({record: me.initiatives[initiativeId].data, text: me.initiatives[initiativeId].get('FormattedID'), showHover: false});

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox',
          align: 'stretch'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      var featureContainer = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        }
      });

      container.add(featureContainer);

      Ext.Array.each(me.featureRecs, function (feature) {
        var featureId = feature.data.ObjectID;

        if (!me.projectsByFeature[featureId]) {
          return;
        }

        if (!me.projectsByFeature[featureId][projectId]) {
          return;
        }

        if (me.features[featureId].get('Parent')) {
          iid = Rally.util.Ref.getOidFromRef(me.features[featureId].get('Parent')._ref) + '';
        } else {
          iid = '0';
        }

        if (initiativeId === iid) {
          featureContainer.add(me.addFeature(projectId, initiativeId, featureId));
        }
      });

      return container;
    },

    addFeature: function (projectId, initiativeId, featureId) {
      //console.log('Adding Feature', featureId);

      var me      = this;
      var i       = 0;
      var spc     = parseInt(me.getSetting('storyCardsPerColumn') + '', 10);
      var bgColor = me.initiatives[initiativeId].get('DisplayColor');
      var data    = {};
      var storyContainer;
      var storyColumnContainer;

      data.type        = 'feature';
      data.name        = me.features[featureId].get('Name');
      data.size        = '';
      data.storySize   = me.features[featureId].get('LeafStoryPlanEstimateTotal') || 0;
      data.featureSize = 0;
      if (me.features[featureId].get('PreliminaryEstimate')) {
        data.featureSize = me.features[featureId].get('PreliminaryEstimate').Value;
      }
      if (data.featureSize) {
        data.size = data.featureSize + ' FP';
      }
      if (data.featureSize && data.storySize) {
        data.size = data.size + ' / ';
      }
      if (data.storySize) {
        data.size = data.size + data.storySize + ' SP';
      }
      data.color   = bgColor;
      data.fidLink = me.fidTemplate.getLink({record: me.features[featureId].data, text: me.features[featureId].get('FormattedID'), showHover: false});

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox',
          align: 'stretch'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      storyContainer = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        }
      });

      container.add(storyContainer);

      Ext.Array.each(me.storyRecs, function (story) {
        var storyId = story.data.ObjectID;
        var parentId = Rally.util.Ref.getOidFromRef(story.get('Feature')._ref);

        if (!me.projectsByStory[storyId]) {
          return;
        }

        if (!me.projectsByStory[storyId][projectId]) {
          return;
        }

        if (parseInt(featureId + '', 10) !== parseInt(parentId + '', 10)) {
          return;
        }

        if (i >= spc) {
          i = 0;
        }

        if (i === 0) {
          storyColumnContainer = Ext.create('Ext.container.Container', {
            layout: {
              type: 'vbox'
            }
          });

          storyContainer.add(storyColumnContainer);
        }

        storyColumnContainer.add(me.addStory(storyId));
        i++;
      });

      return container;
    },

    addStory: function (storyId) {
      var me   = this;
      var data = {
        name:    me.stories[storyId].get('Name'),
        size:    me.stories[storyId].get('PlanEstimate'),
        state:   ('' + me.stories[storyId].get('ScheduleState')).toLowerCase(),
        type:    'story',
        blocked: me.stories[storyId].get('Blocked') ? 'blocked' :'',

        fidLink: me.fidTemplate.getLink({record: me.stories[storyId].data, text: me.stories[storyId].get('FormattedID'), showHover: false})
      };

      //console.log('Story data', data);

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      return container;
    }

});
