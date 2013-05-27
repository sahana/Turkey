/**
 * Used by the Map (modules/s3/s3gis.py)
 * This script is in Static to allow caching
 * Dynamic constants (e.g. Internationalised strings) are set in server-generated script
 *
 * NB Google Earth Panel limited to 1/page due to callback needing global scope (unless we can pass a map_id in somehow)
 */

/**
 * Global vars
 * - usage minimised
 * - per-map configuration & objects are in S3.gis.maps[map_id].s3.xxx
 */
OpenLayers.ImgPath = S3.Ap.concat('/static/img/gis/openlayers/'); // Path for OpenLayers to find it's Theme images
OpenLayers.IMAGE_RELOAD_ATTEMPTS = 3; // avoid pink tiles
OpenLayers.Util.onImageLoadErrorColor = 'transparent';
OpenLayers.ProxyHost = S3.Ap.concat('/gis/proxy?url=');
S3.gis.maps = {}; // Array of all the maps in the page
S3.gis.ajax_loader = S3.Ap.concat('/static/img/ajax-loader.gif');
S3.gis.marker_url = S3.Ap.concat('/static/img/markers/');
S3.gis.format_geojson = new OpenLayers.Format.GeoJSON();
// See http://crschmidt.net/~crschmidt/spherical_mercator.html#reprojecting-points
S3.gis.proj4326 = new OpenLayers.Projection('EPSG:4326');
// Default values if not set by the layer
// Also in modules/s3/s3gis.py
// http://dev.openlayers.org/docs/files/OpenLayers/Strategy/Cluster-js.html
//S3.gis.cluster_attribute = 'colour';
S3.gis.cluster_distance = 20;   // pixels
S3.gis.cluster_threshold = 2;   // minimum # of features to form a cluster

// Module pattern to hide internal vars
(function () {

    // Module scope
    // @ToDo: See if any of these can be removed from global scope
    var ajax_loader = S3.gis.ajax_loader;
    var cluster_distance_default = S3.gis.cluster_distance;   // pixels
    var cluster_threshold_default = S3.gis.cluster_threshold;
    var format_geojson = S3.gis.format_geojson;
    var marker_url_path = S3.gis.marker_url;
    var proj4326 = S3.gis.proj4326;

    /**
     * Main Start Function
     * - called by yepnope callback in s3.gis.loader
     * 
     * Parameters:
     * map_id - {String} A unique ID for this map
     * options - {Array} An array of options for this map 
     *
     * Returns:
     * {OpenLayers.Map} The openlayers map.
     */
    S3.gis.show_map = function(map_id, options) {
        if (undefined == map_id) {
            map_id = 'default';
        }
        if (undefined == options) {
            options = {};
        }

        // @ToDo: Modify modules/s3/s3gis.py to pass these in as options
        // For now, gather them all here in this 1 place
        var gis = S3.gis;

        options.config_id = gis.config_id;

        options.map_height = gis.map_height;
        options.map_width = gis.map_width;
        options.zoom = gis.zoom;
        var lat = gis.lat;
        var lon = gis.lon;
        var bottom_left = gis.bottom_left;
        var top_right = gis.top_right;

        var projection = new OpenLayers.Projection('EPSG:' + gis.projection); // Set by gis.loader.js using arg to s3_gis_loadjs()
        options.projection = projection;
        options.maxResolution = gis.maxResolution;
        var maxExtent = gis.maxExtent;
        options.maxExtent = new OpenLayers.Bounds(maxExtent[0], maxExtent[1], maxExtent[2], maxExtent[3]);
        options.numZoomLevels = gis.numZoomLevels;
        options.units = gis.units;

        options.draw_feature = gis.draw_feature;
        options.draw_polygon = gis.draw_polygon;    // Set by S3SearchLocationWidget as well as s3gis.py
        options.loc_select = gis.loc_select;
        options.mouse_position = gis.mouse_position; // Also read by s3.gis.loader.js
        options.osm_oauth = gis.osm_oauth;
        options.overview = gis.overview;
        options.permalink = gis.permalink;
        options.scaleline = gis.scaleline;
        options.zoomcontrol = gis.zoomcontrol;

        options.marker_default = gis.marker_default;
        options.marker_default_height = gis.marker_default_height;
        options.marker_default_width = gis.marker_default_width;
        // Used by scaleImage callback...currently only in global scope
        //options.max_h = gis.max_h;
        //options.max_w = gis.max_w; 

        options.toolbar = gis.toolbar;
        options.mgrs_name = gis.mgrs_name;
        options.mgrs_url = gis.mgrs_url;
        options.wms_browser_name = gis.wms_browser_name;
        options.wms_browser_url = gis.wms_browser_url;

        options.window = gis.window;
        options.windowHide = gis.windowHide;
        options.maximizable = gis.maximizable;
        options.windowNotClosable = gis.windowNotClosable;
        options.west_collapsed = gis.west_collapsed;

        // Configure the Viewport
        var bounds;
        if (lat && lon) {
            var center = new OpenLayers.LonLat(lon, lat);
            center.transform(proj4326, projection);
        } else if (bottom_left && top_right) {
            bottom_left = new OpenLayers.LonLat(bottom_left[0], bottom_left[1]);
            bottom_left.transform(proj4326, projection);
            var left = bottom_left.lon;
            var bottom = bottom_left.lat;
            top_right = new OpenLayers.LonLat(top_right[0], top_right[1]);
            top_right.transform(proj4326, projection);
            var right = top_right.lon;
            var top = top_right.lat;
            bounds = OpenLayers.Bounds.fromArray([left, bottom, right, top]);
            var center = bounds.getCenterLonLat();
        }
        options.center = center;

        // Build the OpenLayers map
        var map = addMap(map_id, options);

        // Add the GeoExt UI
        // @ToDo: Make this optional
        // @ToDo: Make the map DIV configurable (needed to support >1/page)
        options.renderTo = 'map_panel';
        addMapUI(map);

        // If we were instantiated with bounds, use these now
        if (bounds) {
            map.zoomToExtent(bounds);
        }

        // Return the map object
        return map;
    };

    // Build the OpenLayers map
    var addMap = function(map_id, options) {
        var map_options = {
            // We will add these ourselves later for better control
            controls: [],
            displayProjection: proj4326,
            projection: options.projection,
            // Use Manual stylesheet download (means can be done in HEAD to not delay pageload)
            theme: null,
            // This means that Images get hidden by scrollbars
            //paddingForPopups: new OpenLayers.Bounds(50, 10, 200, 300),
            maxResolution: options.maxResolution,
            maxExtent: options.maxExtent,
            numZoomLevels: options.numZoomLevels,
            units: options.units
        };

        var map = new OpenLayers.Map('center', map_options);

        // Add this map to the global list of maps
        S3.gis.maps[map_id] = map;

        // Create an Array to hold the S3 elements specific for this map
        map.s3 = {};

        // Store the map_id
        map.s3.id = map_id;

        // Store the options used to instantiate the map
        map.s3.options = options;

        // Register Plugins
        map.s3.plugins = [];
        map.registerPlugin = function(plugin) {
            plugin.map = this;
            this.s3.plugins.push(plugin);
        }

        map.showThrobber = function(id) {
            // @ToDo: Allow separate throbbers / map
            $('.layer_throbber').show().removeClass('hide');
            this.s3.layers_loading.pop(id); // we never want 2 pushed
            this.s3.layers_loading.push(id);
        }

        map.hideThrobber = function(id) {
            this.s3.layers_loading.pop(id);
            if (this.s3.layers_loading.length === 0) {
                $('.layer_throbber').hide().addClass('hide');
            }
        }

        // Layers
        addLayers(map);

        // Controls (add these after the layers)
        addControls(map);

        return map;
    }

    // Add the GeoExt UI
    var addMapUI = function(map) {
        var s3 = map.s3;
        var options = s3.options;

        var mapPanel = new GeoExt.MapPanel({
            //cls: 'mappanel',
            height: options.map_height,
            width: options.map_width,
            xtype: 'gx_mappanel',
            map: map,
            center: options.center,
            zoom: options.zoom,
            plugins: []
        });

        // Pass to Global Scope
        s3.mapPanel = mapPanel;

        // Set up shortcuts to allow GXP Plugins to work (needs to find mapPanel)
        var portal = {};
        portal.map = mapPanel;
        s3.portal = portal;

        if (i18n.gis_legend || options.layers_wms) {
            for (var i = 0; i < map.layers.length; i++) {
                // Ensure that legendPanel knows about the Markers for our Feature layers
                if (map.layers[i].legendURL) {
                    mapPanel.layers.data.items[i].data.legendURL = map.layers[i].legendURL;
                }
                // Ensure that mapPanel knows about whether our WMS layers are queryable
                if (map.layers[i].queryable) {
                    mapPanel.layers.data.items[i].data.queryable = 1;
                }
            }
        }

        // Which Elements do we want in our mapWindow?
        // @ToDo: Move all these to Plugins

        // Layer Tree
        var layerTree = addLayerTree(map);

        // Collect Items for the West Panel
        var west_panel_items = [layerTree];

        // WMS Browser
        if (options.wms_browser_url) {
            var wmsBrowser = addWMSBrowser(map);
            if (wmsBrowser) {
                west_panel_items.push(wmsBrowser);
            }
        }

        // Legend Panel
        if (i18n.gis_legend) {
           var legendPanel = new GeoExt.LegendPanel({
                //cls: 'legendpanel',
                title: i18n.gis_legend,
                defaults: {
                    labelCls: 'mylabel',
                    style: 'padding:4px'
                },
                bodyStyle: 'padding:4px',
                autoScroll: true,
                collapsible: true,
                collapseMode: 'mini',
                lines: false
            });
            west_panel_items.push(legendPanel);
        }

        // Plugins
        var plugins = s3.plugins;
        for (var j = 0, len = plugins.length; j < len; ++j) {
            plugins[j].setup(map);
            plugins[j].addToMapWindow(west_panel_items);
        }

        // Pass to Global Scope
        s3.west_panel_items = west_panel_items;

        // Instantiate the main Map window
        if (options.window) {
            addMapWindow(map);
        } else {
            // Embedded Map
            addMapPanel(map);
        }

        // Disable throbber when unchecked
        layerTree.root.eachChild( function() {
            // no layers at top-level, so recurse inside
            this.eachChild( function() {
                if (this.isLeaf()) {
                    this.on('checkchange', function(event, checked) {
                        if (!checked) {
                            // Cancel any associated throbber
                            map.hideThrobber(this.layer.s3_layer_id);
                        }
                    });
                } else {
                    // currently this will not be hit, but when we have sub-folders it will (to 1 level)
                    this.eachChild( function() {
                        if (this.isLeaf()) {
                            this.on('checkchange', function(event, checked) {
                                if (!checked) {
                                    // Cancel any associated throbber
                                    map.hideThrobber(this.layer.s3_layer_id);
                                }
                            });
                        }
                    });
                }
            });
        });

        // Toolbar Tooltips
        Ext.QuickTips.init();
    }

    // Create an embedded Map Panel
    // This is also called when a fullscreen map is made to go embedded
    var addMapPanel = function(map) {
        var s3 = map.s3;
        var options = s3.options;

        var westPanelContainer = addWestPanel(map);
        var mapPanelContainer = addMapPanelContainer(map);

        var mapWin = new Ext.Panel({
            renderTo: options.renderTo,
            autoScroll: true,
            //cls: 'gis-map-panel',
            //maximizable: true,
            titleCollapse: true,
            height: options.map_height,
            width: options.map_width,
            layout: 'border',
            items: [
                westPanelContainer,
                mapPanelContainer
            ]
        });

        // Pass to global scope
        s3.mapWin = mapWin;
    }
    // Pass to global scope so that s3.gis.fullscreen.js can call it to return from fullscreen
    S3.gis.addMapPanel = addMapPanel;

    // Create a floating Map Window
    var addMapWindow = function(map) {
        var s3 = map.s3;
        var options = s3.options;

        var westPanelContainer = addWestPanel(map);
        var mapPanelContainer = addMapPanelContainer(map);

        var mapWin = new Ext.Window({
            cls: 'gis-map-window',
            collapsible: false,
            constrain: true,
            closable: !options.windowNotClosable,
            closeAction: 'hide',
            autoScroll: true,
            maximizable: options.maximizable,
            titleCollapse: false,
            height: options.map_height,
            width: options.map_width,
            layout: 'border',
            items: [
                westPanelContainer,
                mapPanelContainer
            ]
        });

        mapWin.on("beforehide", function(mw){
            if (mw.maximized) {
                mw.restore();
            }
        });

        // Set Options
        if (!options.windowHide) {
            // If the window is meant to be displayed immediately then display it now that it is ready
            mapWin.show();
            mapWin.maximize();
        }

        // pass to Global Scope
        s3.mapWin = mapWin;
    }
    // Pass to global scope so that s3.gis.fullscreen.js can call it to go fullscreen
    S3.gis.addMapWindow = addMapWindow;

    // Put into a Container to allow going fullscreen from a BorderLayout
    var addWestPanel = function(map) {
        var s3 = map.s3;
        var west_collapsed = s3.options.west_collapsed || false;

        var mapWestPanel = new Ext.Panel({
            cls: 'map_tools',
            header: false,
            border: false,
            split: true,
            items: s3.west_panel_items
        });
        var westPanelContainer = new Ext.Panel({
            region: 'west',
            header: false,
            border: true,
            width: 250,
            autoScroll: true,
            collapsible: true,
            collapseMode: 'mini',
            collapsed: west_collapsed,
            items: [
                mapWestPanel
            ]
        });
        // Pass to Global Scope for s3.gis.fullscreen.js
        s3.westPanelContainer = westPanelContainer;
        return westPanelContainer;
    }

    // Put into a Container to allow going fullscreen from a BorderLayout
    // We need to put the mapPanel inside a 'card' container for the Google Earth Panel
    var addMapPanelContainer = function(map) {
        var s3 = map.s3;
        var options = s3.options;

        // Toolbar
        if (options.toolbar) {
            var toolbar = addToolbar(map);
        } else {
            // Enable Controls which we may want independent of the Toolbar
            if (options.draw_feature) {
                if (options.draw_feature == 'active') {
                    var active = true;
                } else {
                    var active = false;
                }
                addPointControl(null, active);
            }
        }

        var mapPanelContainer = new Ext.Panel({
            layout: 'card',
            region: 'center',
            cls: 'mappnlcntr',
            defaults: {
                // applied to each contained panel
                border: false
            },
            items: [
                s3.mapPanel
            ],
            activeItem: 0,
            tbar: toolbar,
            scope: this
        });
        // Pass to Global Scope for s3.gis.fullscreen.js and addGoogleEarthControl
        s3.mapPanelContainer = mapPanelContainer;

        if (options.Google && options.Google.Earth) {
            // Instantiate afresh after going fullscreen as fails otherwise
            var googleEarthPanel = new gxp.GoogleEarthPanel({
                mapPanel: s3.mapPanel
            });
            // Add now rather than when button pressed as otherwise 1st press doesn't do anything
            mapPanelContainer.items.items.push(googleEarthPanel);
            // Pass to global scope to be accessible from addGoogleEarthControl & addGoogleEarthKmlLayers
            s3.googleEarthPanel = googleEarthPanel;
            // Pass to global scope to be accessible from googleEarthKmlLoaded callback
            // => max 1/page!
            S3.gis.googleEarthPanel = googleEarthPanel;
        }

        return mapPanelContainer;
    }

    // Add LayerTree (to be called after the layers are added)
    var addLayerTree = function(map) {

        var layerStore = map.s3.mapPanel.layers;

        // Default Folder for Base Layers
        var layerTreeBase = {
            text: i18n.gis_base_layers,
            nodeType: 'gx_baselayercontainer',
            layerStore: layerStore,
            loader: {
                filter: function(record) {
                    var layer = record.getLayer();
                    return layer.displayInLayerSwitcher === true &&
                           layer.isBaseLayer === true &&
                           (layer.dir === undefined || layer.dir === '');
                }
            },
            leaf: false,
            expanded: true
        };

        // Default Folder for Overlays
        var layerTreeOverlays = {
            text: i18n.gis_overlays,
            nodeType: 'gx_overlaylayercontainer',
            layerStore: layerStore,
            loader: {
                filter: function(record) {
                    var layer = record.getLayer();
                    return layer.displayInLayerSwitcher === true &&
                           layer.isBaseLayer === false &&
                           (layer.dir === undefined || layer.dir === '');
                }
            },
            leaf: false,
            expanded: true
        };

        var nodesArr = [ layerTreeBase, layerTreeOverlays ];

        // User-specified Folders
        var dirs = map.s3.dirs;
        for (var i = 0; i < dirs.length; i++) {
            var folder = dirs[i];
            var child = {
                text: dirs[i],
                nodeType: 'gx_layercontainer',
                layerStore: layerStore,
                loader: {
                    filter: (function(folder) {
                        return function(read) {
                            if (read.data.layer.dir !== 'undefined')
                                return read.data.layer.dir === folder;
                        };
                    })(folder)
                },
                leaf: false,
               expanded: true
            };
            nodesArr.push(child);
        }

        var treeRoot = new Ext.tree.AsyncTreeNode({
            expanded: true,
            children: nodesArr
        });

        var tbar;
        if (i18n.gis_uploadlayer || i18n.gis_properties) {
            tbar = new Ext.Toolbar();
        } else {
            tbar = null;
        }

        var layerTree = new Ext.tree.TreePanel({
            //cls: 'treepanel',
            title: i18n.gis_layers,
            loader: new Ext.tree.TreeLoader({applyLoader: false}),
            root: treeRoot,
            rootVisible: false,
            split: true,
            autoScroll: true,
            collapsible: true,
            collapseMode: 'mini',
            lines: false,
            tbar: tbar,
            enableDD: true
        });

        // Add/Remove Layers
        if (i18n.gis_uploadlayer) {
            addRemoveLayersControl(map, layerTree);
        }
        // Layer Properties
        if (i18n.gis_properties) {
            addLayerPropertiesButton(map, layerTree);
        }

        return layerTree;
    }

    // Add WMS Browser
    var addWMSBrowser = function(map) {
        var options = map.s3.options;
        var root = new Ext.tree.AsyncTreeNode({
            expanded: true,
            loader: new GeoExt.tree.WMSCapabilitiesLoader({
                url: OpenLayers.ProxyHost + options.wms_browser_url,
                layerOptions: {buffer: 1, singleTile: false, ratio: 1, wrapDateLine: true},
                layerParams: {'TRANSPARENT': 'TRUE'},
                // customize the createNode method to add a checkbox to nodes
                createNode: function(attr) {
                    attr.checked = attr.leaf ? false : undefined;
                    return GeoExt.tree.WMSCapabilitiesLoader.prototype.createNode.apply(this, [attr]);
                }
            })
        });
        var wmsBrowser = new Ext.tree.TreePanel({
            //cls: 'wmsbrowser',
            title: options.wms_browser_name,
            root: root,
            rootVisible: false,
            split: true,
            autoScroll: true,
            collapsible: true,
            collapseMode: 'mini',
            lines: false,
            listeners: {
                // Add layers to the map when checked, remove when unchecked.
                // Note that this does not take care of maintaining the layer
                // order on the map.
                'checkchange': function(node, checked) {
                    if (checked === true) {
                        map.addLayer(node.attributes.layer);
                    } else {
                        map.removeLayer(node.attributes.layer);
                    }
                }
            }
        });

        return wmsBrowser;
    }

    /* Layers */

    // @ToDo: Rewrite with layers as inheriting classes

    /**
     * Add Layers from the Catalogue
     * - private function called from addMap()
     *
     * Parameters:
     * map - {OpenLayers.Map}
     *
     * Returns:
     * {null}
     */
    var addLayers = function(map) {
        
        var s3 = map.s3;
        // @ToDo: Move layer configs from S3.gis to options passed to show_map()
        var gis = S3.gis;
        var options = s3.options;
        options.features = gis.features;
        options.layers_arcrest = gis.layers_arcrest;
        options.layers_feature = gis.layers_feature;
        options.layers_feature_query = gis.layers_feature_query;
        options.layers_feature_resource = gis.layers_feature_resource;
        options.layers_geojson = gis.layers_geojson;
        options.layers_georss = gis.layers_georss;
        options.layers_gpx = gis.layers_gpx;
        options.layers_kml = gis.layers_kml;
        options.layers_osm = gis.layers_osm;
        options.layers_shapefile = gis.layers_shapefile;
        options.layers_theme = gis.layers_theme;
        options.layers_tms = gis.layers_tms;
        options.layers_wfs = gis.layers_wfs;
        options.layers_wms = gis.layers_wms;
        options.layers_xyz = gis.layers_xyz;
        options.Bing = gis.Bing;
        options.CoordinateGrid = gis.CoordinateGrid;
        options.EmptyLayer = gis.EmptyLayer;
        options.Google = gis.Google;
        options.OWM = gis.OWM;

        // List of all map layers
        s3.layers_all = [];

        // List of folders for the LayerTree
        s3.dirs = [];

        // Counter to know whether there are layers still loading
        s3.layers_loading = [];

        // @ToDo: Strategy to allow common clustering of multiple layers
        s3.common_cluster_strategy = new OpenLayers.Strategy.AttributeClusterMultiple({
            attribute: 'colour',
            distance: cluster_distance_default,
            threshold: cluster_threshold_default
        })

        var i;
        /* Base Layers */
        // OSM
        if (options.layers_osm) {
            var layers_osm = options.layers_osm;
            for (i = layers_osm.length; i > 0; i--) {
                addOSMLayer(map, layers_osm[i - 1]);
            }
        }
        // Google
        try {
            // Only load Google layers if GoogleAPI downloaded ok
            // - allow rest of map to work offline
            google & addGoogleLayers(map);
        } catch(err) {}

        // Bing
        if (options.Bing) {
            addBingLayers(map);
        }
        // TMS
        if (options.layers_tms) {
            var layers_tms = options.layers_tms;
            for (i = layers_tms.length; i > 0; i--) {
                addTMSLayer(map, layers_tms[i - 1]);
            }
        }
        // WMS
        if (options.layers_wms) {
            var layers_wms = options.layers_wms;
            for (i = layers_wms.length; i > 0; i--) {
                addWMSLayer(map, layers_wms[i - 1]);
            }
        }
        // XYZ
        if (options.layers_xyz) {
            var layers_xyz = options.layers_xyz;
            for (i = layers_xyz.length; i > 0; i--) {
                addXYZLayer(map, layers_xyz[i - 1]);
            }
        }
        // Empty
        if (options.EmptyLayer) {
            var layer = new OpenLayers.Layer(options.EmptyLayer.name, {
                    isBaseLayer: true,
                    displayInLayerSwitcher: true,
                    // This is used to Save State
                    s3_layer_id: options.EmptyLayer.id,
                    s3_layer_type: 'empty'
                }
            );
            map.addLayer(layer);
            if (options.EmptyLayer.base) {
                map.setBaseLayer(layer);
            }
        }
        // JS (generated server-side in s3gis.py)
        try {
            addJSLayers();
        } catch(err) {}

        /* Overlays */
        // Theme
        if (options.layers_theme) {
            var layers_theme = options.layers_theme;
            for (i = layers_theme.length; i > 0; i--) {
                addGeoJSONLayer(map, layers_theme[i - 1]);
            }
        }
        // GeoJSON
        if (options.layers_geojson) {
            var layers_geojson = options.layers_geojson;
            for (i = layers_geojson.length; i > 0; i--) {
                addGeoJSONLayer(map, layers_geojson[i - 1]);
            }
        }
        // GPX
        if (options.layers_gpx) {
            var layers_gpx = options.layers_gpx;
            for (i = layers_gpx.length; i > 0; i--) {
                addGPXLayer(map, layers_gpx[i - 1]);
            }
        }
        // ArcGIS REST
        if (options.layers_arcrest) {
            var layers_arcrest = options.layers_arcrest;
            for (i = layers_arcrest.length; i > 0; i--) {
                addArcRESTLayer(map, layers_arcrest[i - 1]);
            }
        }
        // CoordinateGrid
        if (options.CoordinateGrid) {
            addCoordinateGrid(map);
        }
        // GeoRSS
        if (options.layers_georss) {
            var layers_georss = options.layers_georss;
            for (i = layers_georss.length; i > 0; i--) {
                addGeoJSONLayer(map, layers_georss[i - 1]);
            }
        }
        // KML
        if (options.layers_kml) {
            map.s3.format_kml = new OpenLayers.Format.KML({
                extractStyles: true,
                extractAttributes: true,
                maxDepth: 2
            });
            var layers_kml = options.layers_kml;
            for (i = layers_kml.length; i > 0; i--) {
                addKMLLayer(map, layers_kml[i - 1]);
            }
        }
        // OpenWeatherMap
        if (options.OWM) {
            addOWMLayers(map);
        }
        // Shapefiles
        if (options.layers_shapefile) {
            var layers_shapefile = options.layers_shapefile;
            for (i = layers_shapefile.length; i > 0; i--) {
                addGeoJSONLayer(map, layers_shapefile[i - 1]);
            }
        }
        // WFS
        if (options.layers_wfs) {
            var layers_wfs = options.layers_wfs;
            for (i = layers_wfs.length; i > 0; i--) {
                addWFSLayer(map, layers_wfs[i - 1]);
            }
        }
        // Feature Queries from Mapping API
        if (options.layers_feature_query) {
            var layers_feature_query = options.layers_feature_query;
            for (i = layers_feature_query.length; i > 0; i--) {
                addGeoJSONLayer(map, layers_feature_query[i - 1]);
            }
        }
        // Feature Resources (e.g. Search Results or S3Profile)
        if (options.layers_feature_resource) {
            var layers_feature_resource = options.layers_feature_resource;
            for (i = layers_feature_resource.length; i > 0; i--) {
                addGeoJSONLayer(map, layers_feature_resource[i - 1]);
            }
        }
        // Feature Layers from Catalogue
        if (options.layers_feature) {
            var layers_feature = options.layers_feature;
            for (i = layers_feature.length; i > 0; i--) {
                addGeoJSONLayer(map, layers_feature[i - 1]);
            }
        }
        // Draft Layers
        if (options.features || options.draw_feature || options.draw_polygon || navigator.geolocation) {
            var draftLayer = addDraftLayer(map);
        }
        // Simple Features
        if (options.features) {
            var features = options.features;
            var current_projection = map.getProjectionObject();
            var parsefeature = format_geojson.parseFeature;
            for (i = 0; i < features.length; i++) {
                var feature = parseFeature(features[i]);
                feature.geometry.transform(proj4326, current_projection);
                draftLayer.addFeatures([feature]);
            }
        }
    }

    /**
     * Private Functions
     */

    /**
     * ArcGIS REST
     *
     * @ToDo: Features not Images, so that we can have popups
     * - will require a new OpenLayers.Format.ArcREST
     *
     * @ToDo: Support Token Authentication
     * - Request Token during init of layer:
     * result = GET http[s]://hostname/ArcGIS/tokens?request=getToken&username=myusername&password=mypassword
     * - Append ?token=result to the URL
     */
    var addArcRESTLayer = function(map, layer) {
        var name = layer.name;
        var url = [layer.url];
        var layers;
        if (undefined != layer.layers) {
            layers = layer.layers.join();
        } else {
            // Default layer
            layers = 0;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var isBaseLayer;
        if (undefined != layer.base) {
            isBaseLayer = layer.base;
        } else {
            isBaseLayer = false;
        }
        var transparent;
        if (undefined != layer.transparent) {
            transparent = layer.transparent;
        } else {
            transparent = true;
        }
        var visibility;
        if (undefined != layer.visibility) {
            visibility = layer.visibility;
        } else {
            // Default to visible
            visibility = true;
        }

        var arcRESTLayer = new OpenLayers.Layer.ArcGIS93Rest(
            name, url, {
                // There are other possible options, but this should be sufficient for our needs
                layers: 'show:' + layers,
                isBaseLayer: isBaseLayer,
                transparent: transparent,
                dir: dir,
                // This is used to Save State
                s3_layer_id: layer.id,
                s3_layer_type: 'arcrest'
            }
        );

        arcRESTLayer.setVisibility(visibility);

        map.addLayer(arcRESTLayer);
        if (layer._base) {
            map.setBaseLayer(arcRESTLayer);
        }
    }

    // Bing
    var addBingLayers = function(map) {
        var bing = map.s3.options.Bing;
        var ApiKey = bing.ApiKey;
        var layer;
        if (bing.Aerial) {
            layer = new OpenLayers.Layer.Bing({
                key: ApiKey,
                type: 'Aerial',
                name: bing.Aerial.name,
                // This is used to Save State
                s3_layer_id: bing.Aerial.id,
                s3_layer_type: 'bing'
            });
            map.addLayer(layer);
            if (bing.Base == 'aerial') {
                map.setBaseLayer(layer);
            }
        }
        if (bing.Road) {
            layer = new OpenLayers.Layer.Bing({
                key: ApiKey,
                type: 'Road',
                name: bing.Road.name,
                // This is used to Save State
                s3_layer_id: bing.Road.id,
                s3_layer_type: 'bing'
            });
            map.addLayer(layer);
            if (bing.Base == 'road') {
                map.setBaseLayer(layer);
            }
        }
        if (bing.Hybrid) {
            layer = new OpenLayers.Layer.Bing({
                key: ApiKey,
                type: 'AerialWithLabels',
                name: bing.Hybrid.name,
                // This is used to Save State
                s3_layer_id: bing.Hybrid.id,
                s3_layer_type: 'bing'
            });
            map.addLayer(layer);
            if (bing.Base == 'hybrid') {
                map.setBaseLayer(layer);
            }
        }
    }

    // CoordinateGrid
    var addCoordinateGrid = function(map) {
        var CoordinateGrid = map.s3.options.CoordinateGrid;
        map.addLayer(new OpenLayers.Layer.cdauth.CoordinateGrid(null, {
            name: CoordinateGrid.name,
            shortName: 'grid',
            visibility: CoordinateGrid.visibility,
            // This is used to Save State
            s3_layer_id: CoordinateGrid.id,
            s3_layer_type: 'coordinate'
        }));
    }

    // DraftLayer
    // Used for drawing Points/Polygons & for HTML5 GeoLocation
    var addDraftLayer = function(map) {
        var options = map.s3.options;
        var iconURL = marker_url_path + options.marker_default;
        var marker_height = options.marker_default_height;
        var marker_width = options.marker_default_width;
        // Needs to be uniquely instantiated
        var style_marker = OpenLayers.Util.extend({}, OpenLayers.Feature.Vector.style['default']);
        style_marker.graphicOpacity = 1;
        style_marker.graphicWidth = marker_width;
        style_marker.graphicHeight = marker_height;
        style_marker.graphicXOffset = -(marker_width / 2);
        style_marker.graphicYOffset = -marker_height;
        style_marker.externalGraphic = iconURL;
        var draftLayer = new OpenLayers.Layer.Vector(
            i18n.gis_draft_layer, {
                style: style_marker,
                displayInLayerSwitcher: false
            }
        );
        draftLayer.setVisibility(true);
        map.addLayer(draftLayer);
        // Pass to global scope
        map.s3.draftLayer = draftLayer;
        return draftLayer;
    }

    // GeoJSON
    // Used also by internal Feature Layers, Feature Queries, Feature Resources
    // & GeoRSS feeds
    var addGeoJSONLayer = function(map, layer) {
        var name = layer.name;
        var url = layer.url;
        var marker_url;
        if (undefined != layer.marker_image) {
            // per-Layer Marker
            marker_url = marker_url_path + layer.marker_image;
            var marker_height = layer.marker_height;
            var marker_width = layer.marker_width;
        } else {
            // per-Feature Marker or Shape
            marker_url = '';
        }
        var refresh;
        if (undefined != layer.refresh) {
            refresh = layer.refresh;
        } else {
            refresh = 900; // seconds (so 15 mins)
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ($.inArray(dir, map.s3.dirs) == -1) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var visibility;
        if (undefined != layer.visibility) {
            visibility = layer.visibility;
        } else {
            // Default to visible
            visibility = true;
        }
        var opacity;
        if (undefined != layer.opacity) {
            opacity = layer.opacity;
        } else {
            // Default to opaque
            opacity = 1;
        }
        var cluster_attribute;
        if (undefined != layer.cluster_attribute) {
            cluster_attribute = layer.cluster_attribute;
        } else {
            // Default to global settings
            cluster_attribute = 'colour';
        }
        var cluster_distance;
        if (undefined != layer.cluster_distance) {
            cluster_distance = layer.cluster_distance;
        } else {
            // Default to global settings
            cluster_distance = cluster_distance_default;
        }
        var cluster_threshold;
        if (undefined != layer.cluster_threshold) {
            cluster_threshold = layer.cluster_threshold;
        } else {
            // Default to global settings
            cluster_threshold = cluster_threshold_default;
        }
        var projection;
        if (undefined != layer.projection) {
            projection = layer.projection;
        } else {
            // Feature Layers, GeoRSS & KML are always in 4326
            projection = 4326;
        }
        if (4326 == projection) {
            projection = proj4326;
        } else {
            projection = new OpenLayers.Projection('EPSG:' + projection);
        }
        var layer_type;
        if (undefined != layer.type) {
            layer_type = layer.type;
        } else {
            // Feature Layers
            layer_type = 'feature';
        }
        var style = layer.style;

        // Style Rule For Clusters
        var cluster_style = {
            label: '${label}',
            labelAlign: 'cm',
            pointRadius: '${radius}',
            fillColor: '${fill}',
            fillOpacity: '${fillOpacity}',
            strokeColor: '${stroke}',
            strokeWidth: '${strokeWidth}',
            strokeOpacity: opacity,
            graphicWidth: '${graphicWidth}',
            graphicHeight: '${graphicHeight}',
            graphicXOffset: '${graphicXOffset}',
            graphicYOffset: '${graphicYOffset}',
            graphicOpacity: opacity,
            graphicName: '${graphicName}',
            externalGraphic: '${externalGraphic}'
        };
        var cluster_options = {
            context: {
                graphicWidth: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        // Doesn't usually use a Graphic, however we get JS errors if we don't return a number
                        pix = marker_width;
                    } else if (feature.attributes.marker_width) {
                        // Use marker_width from feature
                        pix = feature.attributes.marker_width;
                    } else {
                        // per-Layer Marker for Unclustered Point
                        pix = marker_width;
                    }
                    return pix;
                },
                graphicHeight: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        // Doesn't usually use a Graphic, however we get JS errors if we don't return a number
                        pix = marker_height;
                    } else if (feature.attributes.marker_height) {
                        // Use marker_height from feature (Query)
                        pix = feature.attributes.marker_height;
                    } else {
                        // per-Layer Marker for Unclustered Point
                        pix = marker_height;
                    }
                    return pix;
                },
                graphicXOffset: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        // Doesn't usually use a Graphic, however we get JS errors if we don't return a number
                        pix = -(marker_width / 2);
                    } else if (feature.attributes.marker_width) {
                        // Use marker_width from feature (e.g. FeatureQuery)
                        pix = -(feature.attributes.marker_width / 2);
                    } else {
                        // per-Layer Marker for Unclustered Point
                        pix = -(marker_width / 2);
                    }
                    return pix;
                },
                graphicYOffset: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        // Doesn't usually use a Graphic, however we get JS errors if we don't return a number
                        pix = -marker_height;
                    } else if (feature.attributes.marker_height) {
                        // Use marker_height from feature (e.g. FeatureQuery)
                        pix = -feature.attributes.marker_height;
                    } else {
                        // per-Layer Marker for Unclustered Point
                        pix = -marker_height;
                    }
                    return pix;
                },
                graphicName: function(feature) {
                    var shape;
                    if (feature.cluster) {
                        // Clustered Point
                        shape = 'circle';
                    } else if (feature.attributes.shape) {
                        // Use shape from feature (e.g. FeatureQuery)
                        shape = feature.attributes.shape;
                    } else {
                        // default to a Circle
                        shape = 'circle';
                    }
                    return shape;
                },
                externalGraphic: function(feature) {
                    var url = '';
                    if (feature.cluster) {
                        // Clustered Point
                        // Just show shape not marker
                        // @ToDo: Make this configurable per-Layer & within-Layer as to which gets shown
                        // e.g. http://openflights.org/blog/2009/10/21/customized-openlayers-cluster-strategies/
                        url = '';
                    } else if (feature.attributes.marker_url) {
                        // Use marker from feature (Query)
                        url = feature.attributes.marker_url;
                    } else if (feature.layer && (undefined != feature.layer.s3_style)) {
                        var style = feature.layer.s3_style;
                        if (Object.prototype.toString.call(style) !== '[object Array]') {
                            // Common Style for all features in layer
                            if (undefined != style.external_graphic) {
                                url = S3.Ap.concat('/static/' + style.external_graphic);
                            }
                        } else {
                            // Lookup from rule
                            var attrib, value;
                            $.each(style, function(index, elem) {
                                if (undefined != elem.attrib) {
                                    attrib = elem.attrib;
                                } else {
                                    // Default (e.g. for Theme Layers)
                                    attrib = 'value';
                                }
                                value = feature.attributes[attrib];
                                if (undefined != elem.cat) {
                                    // Category-based style
                                    if (value == elem.cat) {
                                        url = S3.Ap.concat('/static/' + elem.external_graphic) || marker_url; // Fallback to Layer Marker
                                        return false;
                                    }
                                } else {
                                    // Range-based style
                                    if ((value >= elem.low) && (value < elem.high)) {
                                        url = S3.Ap.concat('/static/' + elem.external_graphic) || marker_url; // Fallback to Layer Marker
                                        return false;
                                    }
                                }
                            });
                        }
                    } else {
                        // Use Layer Marker
                        return marker_url;
                    }
                    return url;
                },
                radius: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Size for Clustered Point
                        pix = Math.min(feature.attributes.count / 2, 8) + 10;
                    } else if (feature.attributes.size) {
                        // Use size from feature (e.g. FeatureQuery)
                        pix = feature.attributes.size;
                    } else {
                        // default Size for Unclustered Point
                        pix = 10;
                    }
                    return pix;
                },
                fill: function(feature) {
                    var color;
                    if (feature.cluster) {
                        if (feature.cluster[0].attributes.colour) {
                            // Use colour from features (e.g. FeatureQuery)
                            color = feature.cluster[0].attributes.colour;
                        } else {
                            // default fillColor for Clustered Point
                            color = '#8087ff';
                        }
                    } else if (feature.attributes.colour) {
                        // Feature Query: Use colour from feature (e.g. FeatureQuery)
                        color = feature.attributes.colour;
                    } else if (feature.layer && (undefined != feature.layer.s3_style)) {
                        var style = feature.layer.s3_style;
                        if (Object.prototype.toString.call(style) !== '[object Array]') {
                            // Common Style for all features in layer
                            color = style.fill;
                        } else {
                            // Lookup from rule
                            var attrib, value;
                            $.each(style, function(index, elem) {
                                if (undefined != elem.attrib) {
                                    attrib = elem.attrib;
                                } else {
                                    // Default (e.g. for Theme Layers)
                                    attrib = 'value';
                                }
                                value = feature.attributes[attrib];
                                if (undefined != elem.cat) {
                                    // Category-based style
                                    if (value == elem.cat) {
                                        color = elem.fill;
                                        return false;
                                    }
                                } else {
                                    // Range-based style
                                    if ((value >= elem.low) && (value < elem.high)) {
                                        color = elem.fill;
                                        return false;
                                    }
                                }
                            });
                        }
                        if (undefined != color) {
                            color = '#' + color;
                        } else {
                            // default fillColor
                            color = '#000000';
                        }
                    } else {
                        // default fillColor for Unclustered Point
                        color = '#f5902e';
                    }
                    return color;
                },
                fillOpacity: function(feature) {
                    var fill_opacity;
                    if (feature.cluster) {
                        if (feature.cluster[0].attributes.opacity) {
                            // Use opacity from features (e.g. FeatureQuery)
                            fill_opacity = feature.cluster[0].attributes.opacity;
                        } else {
                            // default fillOpacity for Clustered Point
                            fill_opacity = opacity;
                        }
                    } else if (feature.attributes.opacity) {
                        // Use opacity from feature (e.g. FeatureQuery)
                        fill_opacity = feature.attributes.opacity;
                    } else if (feature.layer && (undefined != feature.layer.s3_style)) {
                        var style = feature.layer.s3_style;
                        if (Object.prototype.toString.call(style) !== '[object Array]') {
                            // Common Style for all features in layer
                            fill_opacity = style.fill_opacity;
                        } else {
                            // Lookup from rule
                            var attrib, value;
                            $.each(style, function(index, elem) {
                                if (undefined != elem.attrib) {
                                    attrib = elem.attrib;
                                } else {
                                    // Default (e.g. for Theme Layers)
                                    attrib = 'value';
                                }
                                value = feature.attributes[attrib];
                                if (undefined != elem.cat) {
                                    // Category-based style
                                    if (value == elem.cat) {
                                        fill_opacity = elem.fill_opacity;
                                        return false;
                                    }
                                } else {
                                    // Range-based style
                                    if ((value >= elem.low) && (value < elem.high)) {
                                        fill_opacity = elem.fill_opacity;
                                        return false;
                                    }
                                }
                            });
                        }
                    }
                    // default to layer's opacity
                    return fill_opacity || opacity;
                },
                stroke: function(feature) {
                    var color;
                    if (feature.cluster) {
                        if (feature.cluster[0].attributes.colour) {
                            // Use colour from features (e.g. FeatureQuery)
                            color = feature.cluster[0].attributes.colour;
                        } else {
                            // default strokeColor for Clustered Point
                            color = '#2b2f76';
                        }
                    } else if (feature.attributes.colour) {
                        // Use colour from feature (e.g. FeatureQuery)
                        color = feature.attributes.colour;
                    } else if (feature.layer && (undefined != feature.layer.s3_style)) {
                        var style = feature.layer.s3_style;
                        if (Object.prototype.toString.call(style) !== '[object Array]') {
                            // Common Style for all features in layer
                            color = style.stroke || style.fill;
                        } else {
                            // Lookup from rule
                            var attrib, value;
                            $.each(style, function(index, elem) {
                                if (undefined != elem.attrib) {
                                    attrib = elem.attrib;
                                } else {
                                    // Default (e.g. for Theme Layers)
                                    attrib = 'value';
                                }
                                value = feature.attributes[attrib];
                                if (undefined != elem.cat) {
                                    // Category-based style
                                    if (value == elem.cat) {
                                        color = elem.stroke || elem.fill;
                                        return false;
                                    }
                                } else {
                                    // Range-based style
                                    if ((value >= elem.low) && (value < elem.high)) {
                                        color = elem.stroke || elem.fill;
                                        return false;
                                    }
                                }
                            });
                        }
                        if (undefined != color) {
                            color = '#' + color;
                        } else {
                            // default fillColor
                            color = '#000000';
                        }
                    } else {
                        // default strokeColor for Unclustered Point
                        color = '#f5902e';
                    }
                    return color;
                },
                strokeWidth: function(feature) {
                    var width;
                    if (feature.cluster) {
                        if (feature.cluster[0].attributes.stroke_width) {
                            // Use colour from features (e.g. FeatureQuery)
                            width = feature.cluster[0].attributes.stroke_width;
                        } else {
                            // default strokeWidth
                            width = 2;
                        }
                    //} else if (feature.attributes.stroke_width) {
                    //    // Use stroke_width from feature (e.g. FeatureQuery)
                    //    width = feature.attributes.stroke_width;
                    } else if (feature.layer && (undefined != feature.layer.s3_style)) {
                        var style = feature.layer.s3_style;
                        if (Object.prototype.toString.call(style) !== '[object Array]') {
                            // Common Style for all features in layer
                            width = style.stroke_width;
                        } else {
                            // Lookup from rule
                            var attrib, value;
                            $.each(style, function(index, elem) {
                                if (undefined != elem.attrib) {
                                    attrib = elem.attrib;
                                } else {
                                    // Default (e.g. for Theme Layers)
                                    attrib = 'value';
                                }
                                value = feature.attributes[attrib];
                                if (undefined != elem.cat) {
                                    // Category-based style
                                    if (value == elem.cat) {
                                        width = elem.stroke_width;
                                        return false;
                                    }
                                } else {
                                    // Range-based style
                                    if ((value >= elem.low) && (value < elem.high)) {
                                        width = elem.stroke_width;
                                        return false;
                                    }
                                }
                            });
                        }
                    }
                    // Defalt width: 2
                    return width || 2;
                },
                label: function(feature) {
                    // Label For Unclustered Point
                    var label;
                    // Label For Clustered Point
                    if (feature.cluster) {
                        if (feature.attributes.count > 1) {
                            label = feature.attributes.count;
                        }
                    } else if (feature.layer && (undefined != feature.layer.s3_style)) {
                        var style = feature.layer.s3_style;
                        if (Object.prototype.toString.call(style) !== '[object Array]') {
                            // Common Style for all features in layer
                            label = style.label;
                        } else {
                            // Lookup from rule
                            var attrib, value;
                            $.each(style, function(index, elem) {
                                if (undefined != elem.attrib) {
                                    attrib = elem.attrib;
                                } else {
                                    // Default (e.g. for Theme Layers)
                                    attrib = 'value';
                                }
                                value = feature.attributes[attrib];
                                if (undefined != elem.cat) {
                                    // Category-based style
                                    if (value == elem.cat) {
                                        label = elem.label;
                                        return false
                                    }
                                } else {
                                    // Range-based style
                                    if ((value >= elem.low) && (value < elem.high)) {
                                        label = elem.label;
                                        return false
                                    }
                                }
                            });
                        }
                    }
                    return label || '';
                }
            }
        };
        // Needs to be uniquely instantiated
        var style_cluster = new OpenLayers.Style(
            cluster_style,
            cluster_options
        );
        if (Object.prototype.toString.call(style) === '[object Array]') {
            // Style varies per Feature (currently Shapefile or Theme Layer)
            var rules = [];
            var attrib, fill, filter, rule, symbolizer, title;
            $.each(style, function(index, elem) {
                if (undefined != elem.attrib) {
                    attrib = elem.attrib;
                } else {
                    // Default (e.g. for Theme Layers)
                    attrib = 'value';
                }
                if (undefined != elem.cat) {
                    // Category-based style
                    title = elem.label || elem.cat;
                    filter = new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.EQUAL_TO,
                        property: attrib,
                        value: title
                    });
                } else {
                    // Range-based Style
                    title = elem.label || (elem.low + '-' + elem.high);
                    filter = new OpenLayers.Filter.Comparison({
                        type: OpenLayers.Filter.Comparison.BETWEEN,
                        property: attrib,
                        lowerBoundary: elem.low,
                        upperBoundary: elem.high
                    });
                }
                if (undefined != elem.fill) {
                    // Polygon/Point
                    fill = '#' + elem.fill;
                } else if (undefined != elem.stroke) {
                    // LineString
                    fill = '#' + elem.stroke;
                }
                rule = new OpenLayers.Rule({
                    filter: filter,
                    symbolizer: {
                        fillColor: fill, // Used for Legend on LineStrings
                        strokeColor: fill,
                        graphicName: 'square',
                        pointRadius: 10
                    },
                    title: title
                });
                rules.push(rule);
            });
            style_cluster.addRules(rules);
        }
        // Define StyleMap, Using 'style_cluster' rule for 'default' styling intent
        var featureClusterStyleMap = new OpenLayers.StyleMap({
            'default': style_cluster,
            // @ToDo: Customise the Select Style too
            'select': {
                fillColor: '#ffdc33',
                strokeColor: '#ff9933'
            }
        });
        var geojsonLayer = new OpenLayers.Layer.Vector(
            name, {
                dir: dir,
                projection: projection,
                strategies: [
                    // Need to be uniquely instantiated
                    new OpenLayers.Strategy.BBOX({
                        // load features for a wider area than the visible extent to reduce calls
                        ratio: 1.5
                        // don't fetch features after every resolution change
                        //resFactor: 1
                    }),
                    new OpenLayers.Strategy.Refresh({
                        force: true,
                        interval: refresh * 1000 // milliseconds
                        // Close any open Popups to prevent them getting orphaned
                        // - annoying to have this happen automatically, so we handle it in onPopupClose() instead
                        //refresh: function() {
                        //    if (this.layer && this.layer.refresh) {
                        //        while (this.layer.map.popups.length) {
                        //            this.layer.map.removePopup(this.layer.map.popups[0]);
                        //        }
                        //    this.layer.refresh({force: this.force});
                        //    }
                        //}
                    }),
                    // Common Cluster Strategy for all layers
                    //map.s3.common_cluster_strategy
                    new OpenLayers.Strategy.AttributeCluster({
                        attribute: cluster_attribute,
                        distance: cluster_distance,
                        threshold: cluster_threshold
                    })
                ],
                // This gets picked up after mapPanel instantiates & copied to it's layerRecords
                legendURL: marker_url,
                // These are used to Save State & locate Layer to Activate/Refresh
                s3_layer_id: layer.id,
                s3_layer_type: layer_type,
                s3_style: style,
                styleMap: featureClusterStyleMap,
                protocol: new OpenLayers.Protocol.HTTP({
                    url: url,
                    format: format_geojson
                })
            }
        );
        geojsonLayer.setVisibility(visibility);
        geojsonLayer.events.on({
            'featureselected': onFeatureSelect,
            'featureunselected': onFeatureUnselect,
            'loadstart': function(event) {
                map.showThrobber(event.object.s3_layer_id);
            },
            'loadend': function(event) {
                map.hideThrobber(event.object.s3_layer_id);
            }
        });
        map.addLayer(geojsonLayer);
        // Ensure Highlight & Popup Controls act on this layer
        map.s3.layers_all.push(geojsonLayer);
        // Ensure marker layers are rendered over other layers
        //map.setLayerIndex(geojsonLayer, 99);
    }

    // Google
    var addGoogleLayers = function(map) {
        var google = map.s3.options.Google;
        var layer;
        if (google.MapMaker || google.MapMakerHybrid) {
            // v2 API
            if (google.Satellite) {
                layer = new OpenLayers.Layer.Google(
                    google.Satellite.name, {
                        type: G_SATELLITE_MAP,
                        sphericalMercator: true,
                        // This is used to Save State
                        s3_layer_id: google.Satellite.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'satellite') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.Maps) {
                layer = new OpenLayers.Layer.Google(
                    google.Maps.name, {
                        type: G_NORMAL_MAP,
                        sphericalMercator: true,
                        // This is used to Save State
                        s3_layer_id: google.Maps.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'maps') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.Hybrid) {
                layer = new OpenLayers.Layer.Google(
                    google.Hybrid.name, {
                        type: G_HYBRID_MAP,
                        sphericalMercator: true,
                        // This is used to Save State
                        s3_layer_id: google.Hybrid.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'maps') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.Terrain) {
                layer = new OpenLayers.Layer.Google(
                    google.Terrain.name, {
                        type: G_PHYSICAL_MAP,
                        sphericalMercator: true,
                        // This is used to Save State
                        s3_layer_id: google.Terrain.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'terrain') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.MapMaker) {
                layer = new OpenLayers.Layer.Google(
                    google.MapMaker.name, {
                        type: G_MAPMAKER_NORMAL_MAP,
                        sphericalMercator: true,
                        // This is used to Save State
                        s3_layer_id: layer.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'mapmaker') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.MapMakerHybrid) {
                layer = new OpenLayers.Layer.Google(
                    google.MapMakerHybrid.name, {
                        type: G_MAPMAKER_HYBRID_MAP,
                        sphericalMercator: true,
                        // This is used to Save State
                        s3_layer_id: layer.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'mapmakerhybrid') {
                    map.setBaseLayer(layer);
                }
            }
        } else {
            // v3 API
            if (google.Satellite) {
                layer = new OpenLayers.Layer.Google(
                    google.Satellite.name, {
                        type: 'satellite',
                        numZoomLevels: 22,
                        // This is used to Save State
                        s3_layer_id: google.Satellite.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'satellite') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.Maps) {
                layer = new OpenLayers.Layer.Google(
                    google.Maps.name, {
                        numZoomLevels: 20,
                        // This is used to Save State
                        s3_layer_id: google.Maps.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'maps') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.Hybrid) {
                layer = new OpenLayers.Layer.Google(
                    google.Hybrid.name, {
                        type: 'hybrid',
                        numZoomLevels: 20,
                        // This is used to Save State
                        s3_layer_id: google.Hybrid.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'hybrid') {
                    map.setBaseLayer(layer);
                }
            }
            if (google.Terrain) {
                layer = new OpenLayers.Layer.Google(
                    google.Terrain.name, {
                        type: 'terrain',
                        // This is used to Save State
                        s3_layer_id: google.Terrain.id,
                        s3_layer_type: 'google'
                    }
                );
                map.addLayer(layer);
                if (google.Base == 'terrain') {
                    map.setBaseLayer(layer);
                }
            }
        }
    }

    // GPX
    var addGPXLayer = function(map, layer) {
        var name = layer.name;
        var url = layer.url;
        var marker_url = marker_url_path + layer.marker_image;
        var marker_height = layer.marker_height;
        var marker_width = layer.marker_width;
        var waypoints;
        if (undefined != layer.waypoints) {
            waypoints = layer.waypoints;
        } else {
            waypoints = true;
        }
        var tracks;
        if (undefined != layer.tracks) {
            tracks = layer.tracks;
        } else {
            tracks = true;
        }
        var routes;
        if (undefined != layer.routes) {
            routes = layer.routes;
        } else {
            routes = true;
        }
        var visibility;
        if (undefined != layer.visibility) {
            visibility = layer.visibility;
        } else {
            visibility = true;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var opacity;
        if (undefined != layer.opacity) {
            opacity = layer.opacity;
        } else {
            opacity = 1;
        }
        var cluster_distance;
        if (undefined != layer.cluster_distance) {
            cluster_distance = layer.cluster_distance;
        } else {
            cluster_distance = cluster_distance_default;
        }
        var cluster_threshold;
        if (undefined != layer.cluster_threshold) {
            cluster_threshold = layer.cluster_threshold;
        } else {
            cluster_threshold = cluster_threshold_default;
        }

        // Needs to be uniquely instantiated
        var style_marker = OpenLayers.Util.extend({}, OpenLayers.Feature.Vector.style['default']);
        if (waypoints) {
            style_marker.graphicOpacity = opacity;
            style_marker.graphicWidth = marker_width;
            style_marker.graphicHeight = marker_height;
            style_marker.graphicXOffset = -(marker_width / 2);
            style_marker.graphicYOffset = -marker_height;
            style_marker.externalGraphic = marker_url;
        } else {
            style_marker.externalGraphic = '';
        }
        style_marker.strokeColor = 'blue';
        style_marker.strokeWidth = 6;
        style_marker.strokeOpacity = opacity;

        var gpxLayer = new OpenLayers.Layer.Vector(
            name, {
                dir: dir,
                projection: proj4326,
                strategies: [
                    // Need to be uniquely instantiated
                    new OpenLayers.Strategy.Fixed(),
                    new OpenLayers.Strategy.Cluster({
                        distance: cluster_distance,
                        threshold: cluster_threshold
                    })
                ],
                // This is used to Save State
                s3_layer_id: layer.id,
                s3_layer_type: 'gpx',
                // This gets picked up after mapPanel instantiates & copied to it's layerRecords
                legendURL: marker_url,
                style: style_marker,
                protocol: new OpenLayers.Protocol.HTTP({
                    url: url,
                    format: new OpenLayers.Format.GPX({
                        extractAttributes: true,
                        extractWaypoints: waypoints,
                        extractTracks: tracks,
                        extractRoutes: routes
                    })
                })
            }
        );
        gpxLayer.setVisibility(visibility);
        gpxLayer.events.on({
            'featureselected': onFeatureSelect,
            'featureunselected': onFeatureUnselect,
            'loadstart': function(event) {
                map.showThrobber(event.object.s3_layer_id);
            },
            'loadend': function(event) {
                map.hideThrobber(event.object.s3_layer_id);
            }
        });
        map.addLayer(gpxLayer);
        // Ensure Highlight & Popup Controls act on this layer
        map.s3.layers_all.push(gpxLayer);
    }

    // KML
    var addKMLLayer = function(map, layer) {
        var name = layer.name;
        var url = layer.url;
        var marker_url = marker_url_path + layer.marker_image;
        var marker_height = layer.marker_height;
        var marker_width = layer.marker_width;
        var title;
        if (undefined != layer.title) {
            title = layer.title;
        } else {
            title = 'name';
        }
        var body;
        if (undefined != layer.body) {
            body = layer.body;
        } else {
            body = 'description';
        }
        var refresh;
        if (undefined != layer.refresh) {
            refresh = layer.refresh;
        } else {
            refresh = 900; // seconds (so 15 mins)
        }
        var visibility;
        if (undefined != layer.visibility) {
            visibility = layer.visibility;
        } else {
            // Default to visible
            visibility = true;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var opacity;
        if (undefined != layer.opacity) {
            opacity = layer.opacity;
        } else {
            opacity = 1;
        }
        var cluster_distance;
        if (undefined != layer.cluster_distance) {
            cluster_distance = layer.cluster_distance;
        } else {
            cluster_distance = cluster_distance_default;
        }
        var cluster_threshold;
        if (undefined != layer.cluster_threshold) {
            cluster_threshold = layer.cluster_threshold;
        } else {
            cluster_threshold = cluster_threshold_default;
        }

        // Pre-cache this image
        // Need unique names, but keep scope
        // - don't we need an array of these!?
        var image = new Image();
        // Pass to global scope for access by callback
        S3.gis.image = image;
        image.onload = s3_gis_scaleImage;
        image.src = marker_url;
        // Style Rule For Clusters
        var cluster_style = {
            label: '${label}',
            labelAlign: 'cm',
            pointRadius: '${radius}',
            fillColor: '${fill}',
            fillOpacity: opacity,
            strokeColor: '${stroke}',
            strokeWidth: 2,
            strokeOpacity: opacity,
            graphicWidth: '${graphicWidth}',
            graphicHeight: '${graphicHeight}',
            graphicXOffset: '${graphicXOffset}',
            graphicYOffset: '${graphicYOffset}',
            graphicOpacity: opacity,
            graphicName: 'circle',
            externalGraphic: '${externalGraphic}'
        };
        var cluster_options = {
            context: {
                graphicWidth: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        pix = '';
                    } else {
                        pix = image.width;
                    }
                    return pix;
                },
                graphicHeight: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        pix = '';
                    } else {
                        pix = image.height;
                    }
                    return pix;
                },
                graphicXOffset: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        pix = '';
                    } else {
                        pix = -(image.width / 2);
                    }
                    return pix;
                },
                graphicYOffset: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Clustered Point
                        pix = '';
                    } else {
                        pix = -image.height;
                    }
                    return pix;
                },
                externalGraphic: function(feature) {
                    var url;
                    if (feature.cluster) {
                        // Clustered Point
                        url = '';
                    } else {
                        url = marker_url;
                    }
                    return url;
                },
                radius: function(feature) {
                    var pix;
                    if (feature.cluster) {
                        // Size for Clustered Point
                        pix = Math.min(feature.attributes.count/2, 8) + 10;
                    } else {
                        // default Size for Unclustered Point
                        pix = 10;
                    }
                    return pix;
                },
                fill: function(feature) {
                    var color;
                    if (feature.cluster) {
                        // default fillColor for Clustered Point
                        color = '#8087ff';
                    } else {
                        // default fillColor for Unclustered Point
                        color = '#f5902e';
                    }
                    return color;
                },
                stroke: function(feature) {
                    var color;
                    if (feature.cluster) {
                        // default strokeColor for Clustered Point
                        color = '#2b2f76';
                    } else {
                        // default strokeColor for Unclustered Point
                        color = '#f5902e';
                    }
                    return color;
                },
                label: function(feature) {
                    // Label For Unclustered Point
                    var label = '';
                    // Label For Clustered Point
                    if (feature.cluster && feature.attributes.count > 1) {
                        label = feature.attributes.count;
                    }
                    return label;
                }
            }
        };
        // Needs to be uniquely instantiated
        var style_cluster = new OpenLayers.Style(
            cluster_style,
            cluster_options
        );
        // Define StyleMap, Using 'style_cluster' rule for 'default' styling intent
        var featureClusterStyleMap = new OpenLayers.StyleMap({
            'default': style_cluster,
            // @ToDo: Customise the Select Style too
            'select': {
                fillColor: '#ffdc33',
                strokeColor: '#ff9933'
            }
        });
        var kmlLayer = new OpenLayers.Layer.Vector(
            name, {
                dir: dir,
                projection: proj4326,
                // Need to be uniquely instantiated
                strategies: [
                    new OpenLayers.Strategy.Fixed(),
                    new OpenLayers.Strategy.Cluster({
                        distance: cluster_distance,
                        threshold: cluster_threshold
                    }),
                    new OpenLayers.Strategy.Refresh({
                        force: true,
                        interval: refresh * 1000 // milliseconds
                    })
                ],
                // This is used to Save State
                s3_layer_id: layer.id,
                s3_layer_type: 'kml',
                // This gets picked up after mapPanel instantiates & copied to it's layerRecords
                legendURL: marker_url,
                styleMap: featureClusterStyleMap,
                protocol: new OpenLayers.Protocol.HTTP({
                    url: url,
                    format: map.s3.format_kml
                })
            }
        );
        kmlLayer.title = title;
        kmlLayer.body = body;

        kmlLayer.setVisibility(visibility);
        kmlLayer.events.on({
            'featureselected': onFeatureSelect,
            'featureunselected': onFeatureUnselect,
            'loadstart': function(event) {
                map.showThrobber(event.object.s3_layer_id);
            },
            'loadend': function(event) {
                map.hideThrobber(event.object.s3_layer_id);
            }
        });
        map.addLayer(kmlLayer);
        // Ensure Highlight & Popup Controls act on this layer
        map.s3.layers_all.push(kmlLayer);
    }

    // Scales the global Image() object
    // Used by KML Layers whose Marker is downloaded from a remote site & so we don't know the height/width in advance
    s3_gis_scaleImage = function() {
        // @ToDo: Can we pass image this way instead of via global? (or just use Module scope at least?)
        // - still need to collect the return output somehow...
        //var image = this;
        var image = S3.gis.image;
        var scaleRatio = image.height / image.width;
        var w = Math.min(image.width, max_w);
        var h = w * scaleRatio;
        if (h > max_h) {
            h = max_h;
            scaleRatio = w / h;
            w = w * scaleRatio;
        }
        image.height = h;
        image.width = w;
    };

    // OpenStreetMap
    var addOSMLayer = function(map, layer) {
        var name = layer.name;
        var url = [layer.url1];
        if (undefined != layer.url2) {
            url.push(layer.url2);
        }
        if (undefined != layer.url3) {
            url.push(layer.url3);
        }
        var visibility;
        if (undefined != layer.visibility) {
            visibility = layer.visibility;
        } else {
            // Default to visible
            visibility = true;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var isBaseLayer;
        if (undefined != layer.base) {
            isBaseLayer = layer.base;
        } else {
            isBaseLayer = true;
        }
        var numZoomLevels;
        if (undefined != layer.zoomLevels) {
            numZoomLevels = layer.zoomLevels;
        } else {
            numZoomLevels = 19;
        }

        var osmLayer = new OpenLayers.Layer.TMS(
            name,
            url, {
                dir: dir,
                type: 'png',
                getURL: osm_getTileURL,
                displayOutsideMaxExtent: true,
                numZoomLevels: numZoomLevels,
                isBaseLayer: isBaseLayer,
                // This is used to Save State
                s3_layer_id: layer.id,
                s3_layer_type: 'openstreetmap'
            }
        );
        if (undefined != layer.attribution) {
            osmLayer.attribution = layer.attribution;
        }
        osmLayer.setVisibility(visibility);
        map.addLayer(osmLayer);
        if (layer._base) {
            map.setBaseLayer(osmLayer);
        }
    }

    // Supports OpenStreetMap TMS Layers
    function osm_getTileURL(bounds) {
        var res = this.map.getResolution();
        var x = Math.round((bounds.left - this.maxExtent.left) / (res * this.tileSize.w));
        var y = Math.round((this.maxExtent.top - bounds.top) / (res * this.tileSize.h));
        var z = this.map.getZoom();
        var limit = Math.pow(2, z);
        if (y < 0 || y >= limit) {
            return OpenLayers.Util.getImagesLocation() + '404.png';
        } else {
            x = ((x % limit) + limit) % limit;
            var path = z + '/' + x + '/' + y + '.' + this.type;
            var url = this.url;
            if (url instanceof Array) {
                url = this.selectUrl(path, url);
            }
            return url + path;
        }
    }

    // OpenWeatherMap
    var addOWMLayers = function(map) {
        var owm = map.s3.options.OWM;
        var layer;
        if (owm.station) {
            layer = new OpenLayers.Layer.Vector.OWMStations(
                owm.station.name,
                {dir: owm.station.dir,
                 // This is used to Save State
                 s3_layer_id: owm.station.id,
                 s3_layer_type: 'openweathermap'
                }
            );
            layer.setVisibility(owm.station.visibility);
            layer.events.on({
                'featureselected': layer.onSelect,
                'featureunselected': layer.onUnselect,
                'loadstart': function(event) {
                    map.showThrobber(event.object.s3_layer_id);
                },
                'loadend': function(event) {
                    map.hideThrobber(event.object.s3_layer_id);
                }
            });
            map.addLayer(layer);
            // Ensure Highlight & Popup Controls act on this layer
            map.s3.layers_all.push(layer);
        }
        if (owm.city) {
            layer = new OpenLayers.Layer.Vector.OWMWeather(
                owm.city.name,
                {dir: owm.city.dir,
                 // This is used to Save State
                 s3_layer_id: owm.city.id,
                 s3_layer_type: 'openweathermap'
                }
            );
            layer.setVisibility(owm.city.visibility);
            layer.events.on({
                'featureselected': layer.onSelect,
                'featureunselected': layer.onUnselect,
                'loadstart': function(event) {
                    map.showThrobber(event.object.s3_layer_id);
                },
                'loadend': function(event) {
                    map.hideThrobber(event.object.s3_layer_id);
                }
            });
            map.addLayer(layer);
            // Ensure Highlight & Popup Controls act on this layer
            map.s3.layers_all.push(layer);
        }
    }

    // TMS
    var addTMSLayer = function(map, layer) {
        var name = layer.name;
        var url = [layer.url];
        if (undefined != layer.url2) {
            url.push(layer.url2);
        }
        if (undefined != layer.url3) {
            url.push(layer.url3);
        }
        var layername = layer.layername;
        var numZoomLevels;
        if (undefined != layer.zoomLevels) {
            numZoomLevels = layer.zoomLevels;
        } else {
            numZoomLevels = 19;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var format;
        if (undefined != layer.format) {
            format = layer.format;
        } else {
            format = 'png';
        }

        var tmsLayer = new OpenLayers.Layer.TMS(
            name, url, {
                dir: dir,
                // This is used to Save State
                s3_layer_id: layer.id,
                s3_layer_type: 'tms',
                layername: layername,
                type: format,
                numZoomLevels: numZoomLevels
            }
        );

        if (undefined != layer.attribution) {
            tmsLayer.attribution = layer.attribution;
        }
        map.addLayer(tmsLayer);
        if (layer._base) {
            map.setBaseLayer(tmsLayer);
        }
    }

    // WFS
    // @ToDo: WFS-T Editing: http://www.gistutor.com/openlayers/22-advanced-openlayers-tutorials/47-openlayers-wfs-t-using-a-geoserver-hosted-postgis-layer.html
    var addWFSLayer = function(map, layer) {
        var name = layer.name;
        var url = layer.url;
        if ((undefined != layer.username) && (undefined != layer.password)) {
            var username = layer.username;
            var password = layer.password;
            url = url.replace('://', '://' + username + ':' + password + '@');
        }
        var title = layer.title;
        var featureType = layer.featureType;
        var featureNS = layer.featureNS;
        var schema = layer.schema;
        //var editable = layer.editable;
        var version;
        if (undefined != layer.version) {
            version = layer.version;
        } else {
            version = '1.1.0';
        }
        var geometryName;
        if (undefined != layer.geometryName) {
            geometryName = layer.geometryName;
        } else {
            geometryName = 'the_geom';
        }
        // @ToDo: Replace with Style JSON
        var styleField;
        if (undefined != layer.styleField) {
            styleField = layer.styleField;
        } else {
            styleField = '';
        }
        var styleValues;
        if (undefined != layer.styleValues) {
            styleValues = layer.styleValues;
        } else {
            styleValues = {};
        }
        var visibility;
        if (undefined != layer.visibility) {
            visibility = layer.visibility;
        } else {
            // Default to visible
            visibility = true;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var opacity;
        if (undefined != layer.opacity) {
            opacity = layer.opacity;
        } else {
            opacity = 1;
        }
        var cluster_distance;
        if (undefined != layer.cluster_distance) {
            cluster_distance = layer.cluster_distance;
        } else {
            cluster_distance = cluster_distance_default;
        }
        var cluster_threshold;
        if (undefined != layer.cluster_threshold) {
            cluster_threshold = layer.cluster_threshold;
        } else {
            cluster_threshold = cluster_threshold_default;
        }
        var projection;
        var srsName;
        if (undefined != layer.projection) {
            projection = layer.projection;
            srsName = 'EPSG:' + projection;
        } else {
            projection = '4326';
            srsName = 'EPSG:4326';
        }
        var protocol = new OpenLayers.Protocol.WFS({
            version: version,
            srsName: srsName,
            url: url,
            featureType: featureType,
            featureNS: featureNS,
            geometryName: geometryName,
            // Needed for WFS-T
            schema: schema
        });

        var cluster_options = {
            context: {
                radius: function(feature) {
                    // Size for Unclustered Point
                    var pix = 12;
                    // Size for Clustered Point
                    if (feature.cluster) {
                        pix = Math.min(feature.attributes.count/2, 8) + 12;
                    }
                    return pix;
                },
                fill: function(feature) {
                    // fillColor for Unclustered Point
                    var color = '#f5902e';
                    // fillColor for Clustered Point
                    if (feature.cluster) {
                        color = '#8087ff';
                    }
                    return color;
                },
                stroke: function(feature) {
                    // strokeColor for Unclustered Point
                    var color = '#f5902e';
                    // strokeColor for Clustered Point
                    if (feature.cluster) {
                        color = '#2b2f76';
                    }
                    return color;
                },
                label: function(feature) {
                    // Label For Unclustered Point
                    var label = '';
                    // Label For Clustered Point
                    if (feature.cluster && feature.attributes.count > 1) {
                        label = feature.attributes.count;
                    }
                    return label;
                }
            }
        };

        if (styleField && styleValues) {
            // Use the Custom Styling
            // Old: Make a Deep Copy of the Global Styling
            //cluster_options = $.extend(true, {}, cluster_options);
            cluster_options.context.fill = function(feature) {
                // fillColor for Unclustered Point
                var color;
                $.each(styleValues, function(i, n) {
                    if (i == feature.attributes[styleField]) {
                        color = n;
                    }
                });
                if (!color) {
                    // Default colour if we haven't had one provided
                    color = '#f5902e';
                }
                // fillColor for Clustered Point
                if (feature.cluster) {
                    color = '#8087ff';
                }
                return color;
            };
            cluster_options.context.stroke = function(feature) {
                // strokeColor for Unclustered Point
                var color;
                $.each(styleValues, function(i, n) {
                    if (i == feature.attributes[styleField]) {
                        color = n;
                    }
                });
                if (!color) {
                    // Default colour if we haven't had one provided
                    color = '#f5902e';
                }
                // strokeColor for Clustered Point
                if (feature.cluster) {
                    color = '#2b2f76';
                }
                return color;
            };
        }

        // Needs to be uniquely instantiated
        var style_cluster = new OpenLayers.Style (
            {
                label: '${label}',
                labelAlign: 'cm',
                pointRadius: '${radius}',
                fillColor: '${fill}',
                fillOpacity: opacity / 2,
                strokeColor: '${stroke}',
                strokeWidth: 2,
                strokeOpacity: opacity
            },
            cluster_options
        );
        // Define StyleMap, Using 'style_cluster' rule for 'default' styling intent
        var featureClusterStyleMap = new OpenLayers.StyleMap({
            'default': style_cluster,
            'select': {
                fillColor: '#ffdc33',
                strokeColor: '#ff9933'
            }
        });

        if ('4326' == projection) {
            projection = proj4326;
        } else {
            projection = new OpenLayers.Projection('EPSG:' + projection);
        }

        // Put these in Global Scope & i18n the messages
        //function showSuccessMsg(){
        //    showMsg("Transaction successfully completed");
        //}
        //function showFailureMsg(){
        //    showMsg("An error occured while operating the transaction");
        //}
        // if Editable
        // Set up a save strategy
        //var saveStrategy = new OpenLayers.Strategy.Save();
        //saveStrategy.events.register("success", '', showSuccessMsg);
        //saveStrategy.events.register("failure", '', showFailureMsg);

        var wfsLayer = new OpenLayers.Layer.Vector(
            name, {
            // limit the number of features to avoid browser freezes
            maxFeatures: 1000,
            strategies: [
                new OpenLayers.Strategy.BBOX({
                    // load features for a wider area than the visible extent to reduce calls
                    ratio: 1.5
                    // don't fetch features after every resolution change
                    //resFactor: 1
                }),
                new OpenLayers.Strategy.Cluster({
                    distance: cluster_distance,
                    threshold: cluster_threshold
                })//,
                // if Editable
                //saveStrategy
            ],
            dir: dir,
            // This is used to Save State
            s3_layer_id: layer.id,
            s3_layer_type: 'wfs',
            projection: projection,
            //outputFormat: "json",
            //readFormat: new OpenLayers.Format.GeoJSON(),
            protocol: protocol,
            styleMap: featureClusterStyleMap
        });

        wfsLayer.title = title;
        wfsLayer.setVisibility(visibility);
        wfsLayer.events.on({
            'featureselected': onFeatureSelect,
            'featureunselected': onFeatureUnselect,
            'loadstart': function(event) {
                map.showThrobber(event.object.s3_layer_id);
            },
            'loadend': function(event) {
                map.hideThrobber(event.object.s3_layer_id);
            }
        });
        map.addLayer(wfsLayer);
        // Ensure Highlight & Popup Controls act on this layer
        map.s3.layers_all.push(wfsLayer);
    }

    // WMS
    var addWMSLayer = function(map, layer) {
        var name = layer.name;
        var url = layer.url;
        if ((undefined != layer.username) && (undefined != layer.password)) {
            var username = layer.username;
            var password = layer.password;
            url = url.replace('://', '://' + username + ':' + password + '@');
        }
        var layers = layer.layers;
        var visibility;
        if (undefined != layer.visibility) {
            visibility = layer.visibility;
        } else {
            visibility = true;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var isBaseLayer;
        if (undefined != layer.base) {
            isBaseLayer = layer.base;
        } else {
            isBaseLayer = false;
        }
        var transparent;
        if (undefined != layer.transparent) {
            transparent = layer.transparent;
        } else {
            transparent = true;
        }
        var format;
        if (undefined != layer.format) {
            format = layer.format;
        } else {
            format = 'image/png';
        }
        var version;
        if (undefined != layer.version) {
            version = layer.version;
        } else {
            version = '1.1.1';
        }
        var wms_map;
        if (undefined != layer.map) {
            wms_map = layer.map;
        } else {
            wms_map = '';
        }
        var style;
        if (undefined != layer.style) {
            style = layer.style;
        } else {
            style = '';
        }
        var bgcolor;
        if (undefined != layer.bgcolor) {
            bgcolor = '0x' + layer.bgcolor;
        } else {
            bgcolor = '';
        }
        var buffer;
        if (undefined != layer.buffer) {
            buffer = layer.buffer;
        } else {
            buffer = 0;
        }
        var tiled;
        if (undefined != layer.tiled) {
            tiled = layer.tiled;
        } else {
            tiled = false;
        }
        var opacity;
        if (undefined != layer.opacity) {
            opacity = layer.opacity;
        } else {
            opacity = 1;
        }
        var queryable;
        if (undefined != layer.queryable) {
            queryable = layer.queryable;
        } else {
            queryable = 1;
        }
        var legendURL;
        if (undefined != layer.legendURL) {
            legendURL = layer.legendURL;
        }

        var wmsLayer = new OpenLayers.Layer.WMS(
            name, url, {
                layers: layers,
                transparent: transparent
            },
            {
                dir: dir,
                wrapDateLine: true,
                isBaseLayer: isBaseLayer,
                // This is used to Save State
                s3_layer_id: layer.id,
                s3_layer_type: 'wms',
                // This gets picked up after mapPanel instantiates & copied to it's layerRecords
                queryable: queryable,
                visibility: visibility
            }
        );
        if (wms_map) {
            wmsLayer.params.MAP = wms_map;
        }
        if (format) {
            wmsLayer.params.FORMAT = format;
        }
        if (version) {
            wmsLayer.params.VERSION = version;
        }
        if (style) {
            wmsLayer.params.STYLES = style;
        }
        if (bgcolor) {
            wmsLayer.params.BGCOLOR = bgcolor;
        }
        if (tiled) {
            wmsLayer.params.TILED = true;
            wmsLayer.params.TILESORIGIN = [map.maxExtent.left, map.maxExtent.bottom];
        }
        if (!isBaseLayer) {
            wmsLayer.opacity = opacity;
            if (buffer) {
                wmsLayer.buffer = buffer;
            } else {
                wmsLayer.buffer = 0;
            }
        }
        if (legendURL) {
            // This gets picked up after mapPanel instantiates & copied to it's layerRecords
            wmsLayer.legendURL = legendURL;
        }
        map.addLayer(wmsLayer);
        if (layer._base) {
            map.setBaseLayer(wmsLayer);
        }
    }

    // XYZ
    var addXYZLayer = function(map, layer) {
        var name = layer.name;
        var url = [layer.url];
        if (undefined != layer.url2) {
            url.push(layer.url2);
        }
        if (undefined != layer.url3) {
            url.push(layer.url3);
        }
        var layername = layer.layername;
        var numZoomLevels;
        if (undefined != layer.zoomLevels) {
            numZoomLevels = layer.zoomLevels;
        } else {
            numZoomLevels = 19;
        }
        var dir;
        if (undefined != layer.dir) {
            dir = layer.dir;
            if ( $.inArray(dir, map.s3.dirs) == -1 ) {
                // Add this folder to the list of folders
                map.s3.dirs.push(dir);
            }
        } else {
            // Default folder
            dir = '';
        }
        var format;
        if (undefined != layer.format) {
            format = layer.format;
        } else {
            format = 'png';
        }

        var xyzLayer = new OpenLayers.Layer.XYZ(
            name, url, {
                dir: dir,
                // This is used to Save State
                s3_layer_id: layer.id,
                s3_layer_type: 'xyz',
                layername: layername,
                type: format,
                numZoomLevels: numZoomLevels
            }
        );

        if (undefined != layer.attribution) {
            xyzLayer.attribution = layer.attribution;
        }
        map.addLayer(xyzLayer);
        if (layer._base) {
            map.setBaseLayer(xyzLayer);
        }
    }

    /**
     * Add Controls to the OpenLayers map
     * - private function called from addMap()
     * - to be called after the layers are added
     *
     * Parameters:
     * map - {OpenLayers.Map}
     *
     * Returns:
     * {null}
     */
    var addControls = function(map) {
        var options = map.s3.options;

        // The default controls (normally added in OpenLayers.Map, but brought here for greater control)
        // Navigation or TouchNavigation depending on what is in build
        //if (OpenLayers.Control.Navigation) {
            map.addControl(new OpenLayers.Control.Navigation());
        //} else if (OpenLayers.Control.TouchNavigation) {
        //    map.addControl(new OpenLayers.Control.TouchNavigation());
        //}
        if (options.zoomcontrol == undefined) {
            //if (OpenLayers.Control.Zoom) {
                map.addControl(new OpenLayers.Control.Zoom());
            //} else if (OpenLayers.Control.PanZoom) {
            //    map.addControl(new OpenLayers.Control.PanZoom());
            //}
        }
        //if (OpenLayers.Control.ArgParser) {
            map.addControl(new OpenLayers.Control.ArgParser());
        //}
        //if (OpenLayers.Control.Attribution) {
            map.addControl(new OpenLayers.Control.Attribution());
        //}

        // Additional Controls
        // (since the default is enabled, we provide no config in the enabled case)
        if (options.scaleline == undefined) {
            map.addControl(new OpenLayers.Control.ScaleLine());
        }
        if (options.mouse_position == 'mgrs') {
            map.addControl(new OpenLayers.Control.MGRSMousePosition());
        } else if (options.mouse_position) {
            map.addControl(new OpenLayers.Control.MousePosition());
        }
        if (options.permalink == undefined) {
            map.addControl(new OpenLayers.Control.Permalink());
        }
        if (options.overview == undefined) {
            // Copy all map options to the overview map, other than the controls
            var ov_options = {};
            var map_options = map.options;
            var prop;
            for (prop in map_options) {
                if (prop != 'controls') {
                    ov_options[prop] = map_options[prop];
                }
            }
            map.addControl(new OpenLayers.Control.OverviewMap({mapOptions: ov_options}));
        }

        // Popup Controls
        addPopupControls(map);
    }

    /* Popups */
    var addPopupControls = function(map) {
        var layers_all = map.s3.layers_all;
        // onClick Popup
        var popupControl = new OpenLayers.Control.SelectFeature(
            layers_all, {
                toggle: true
                //multiple: true
            }
        );
        // onHover Tooltip
        var highlightControl = new OpenLayers.Control.SelectFeature(
            layers_all, {
                hover: true,
                highlightOnly: true,
                //renderIntent: 'temporary',
                eventListeners: {
                    featurehighlighted: s3_gis_tooltipSelect,
                    featureunhighlighted: s3_gis_tooltipUnselect
                }
            }
        );
        map.addControl(highlightControl);
        map.addControl(popupControl);
        highlightControl.activate();
        popupControl.activate();
    }

    // Supports highlightControl for All Vector Layers
    function s3_gis_tooltipSelect(event) {
        var feature = event.feature;
        if (feature.cluster) {
            // Cluster: no tooltip
        } else {
            // Single Feature: show tooltip
            // Ensure only 1 Tooltip Popup / map
            var map = feature.layer.map;
            var lastFeature = map.s3.lastFeature;
            var tooltipPopup = map.s3.tooltipPopup;
            //map.s3.selectedFeature = feature;
            // if there is already an opened details window, don\'t draw the tooltip
            if (feature.popup !== null) {
                return;
            }
            // if there are other tooltips active, destroy them
            if ((tooltipPopup !== null) && (tooltipPopup !== undefined)) {
                map.removePopup(tooltipPopup);
                tooltipPopup.destroy();
                if (lastFeature !== null) {
                    delete lastFeature.popup;
                }
                tooltipPopup = null;
            }
            lastFeature = feature;
            var centerPoint = feature.geometry.getBounds().getCenterLonLat();
            var attributes = feature.attributes;
            var tooltip;
            if (undefined != attributes.popup) {
                // GeoJSON Feature Layers or Theme Layers
                tooltip = attributes.popup;
            } else if (undefined != attributes.name) {
                // GeoJSON, GeoRSS or Legacy Features
                tooltip = attributes.name;
            } else if (undefined != feature.layer.title) {
                // KML or WFS
                var a = attributes[feature.layer.title];
                var type = typeof a;
                if ('object' == type) {
                    tooltip = a.value;
                } else {
                    tooltip = a;
                }
            }
            if (tooltip) {
                tooltipPopup = new OpenLayers.Popup(
                    'activetooltip',
                    centerPoint,
                    new OpenLayers.Size(80, 12),
                    tooltip,
                    false
                );
            }
            if ((tooltipPopup !== null) && (tooltipPopup !== undefined)) {
                // should be moved to CSS
                tooltipPopup.contentDiv.style.backgroundColor = 'ffffcb';
                tooltipPopup.contentDiv.style.overflow = 'hidden';
                tooltipPopup.contentDiv.style.padding = '3px';
                tooltipPopup.contentDiv.style.margin = '10px';
                tooltipPopup.closeOnMove = true;
                tooltipPopup.autoSize = true;
                tooltipPopup.opacity = 0.7;
                feature.popup = tooltipPopup;
                map.addPopup(tooltipPopup);
            }
        }
    }
    function s3_gis_tooltipUnselect(event) {
        var feature = event.feature;
        if (feature !== null && feature.popup !== null) {
            var map = feature.layer.map;
            map.removePopup(feature.popup);
            feature.popup.destroy();
            delete feature.popup;
            map.s3.tooltipPopup = null;
            map.s3.lastFeature = null;
        }
    }

    // Replace Cluster Popup contents with selected Feature Popup
    function loadClusterPopup(map_id, url, id) {
        // Show Throbber whilst waiting for Popup to show
        var contents = i18n.gis_loading + "...<img src='" + ajax_loader + "' border=0 />";
        $('#' + id + '_contentDiv').html(contents);
        // Load data into Popup
        var map = S3.gis.maps[map_id];
        $.get(url,
              function(data) {
                $('#' + id + '_contentDiv').html(data);
                map.popups[0].updateSize();
              },
              'html'
        );
    }
    // Pass to global scope to access from HTML
    S3.gis.loadClusterPopup = loadClusterPopup;

    // Zoom to Selected Feature from within Cluster Popup
    function zoomToSelectedFeature(map_id, lon, lat, zoomfactor) {
        var map = S3.gis.maps[map_id];
        var lonlat = new OpenLayers.LonLat(lon, lat);
        // Get Current Zoom
        var currZoom = map.getZoom();
        // New Zoom
        var newZoom = currZoom + zoomfactor;
        // Center and Zoom
        map.setCenter(lonlat, newZoom);
        // Remove Popups
        for (var i = 0; i < map.popups.length; i++) {
            map.removePopup(map.popups[i]);
        }
    }
    // Pass to global scope to access from HTML
    S3.gis.zoomToSelectedFeature = zoomToSelectedFeature;

    // Used by onFeatureSelect
    function loadDetails(url, id, popup) {
        // Load the Popup Details asynchronously
        $.ajax({
            'url': url,
            'success': function(data) {
                $('#' + id).html(data);
                popup.updateSize();
                // Resize when images are loaded
                //popup.registerImageListeners();
            },
            'error': function(request, status, error) {
                if (error == 'UNAUTHORIZED') {
                    msg = i18n.gis_requires_login;
                } else {
                    msg = request.responseText;
                }
                $('#' + id + '_contentDiv').html(msg);
                popup.updateSize();
            },
            'dataType': 'html'
        });
    }

    // Supports popupControl for All Vector Layers
    function onFeatureSelect(event) {
        // Unselect any previous selections
        // @ToDo: setting to allow multiple popups at once
        s3_gis_tooltipUnselect(event);
        var feature = event.feature;
        var layer = feature.layer
        var layer_type = layer.s3_layer_type;
        var map = layer.map;
        var centerPoint = feature.geometry.getBounds().getCenterLonLat();
        var popup_id = S3.uid();
        if (undefined != layer.title) {
            // KML, WFS
            var titleField = layer.title;
        } else {
            var titleField = 'name';
        }
        var contents, data_link, name, popup_url;
        if (feature.cluster) {
            // Cluster
            var cluster = feature.cluster;
            contents = i18n.gis_cluster_multiple + ':<ul>';
            // Only display 1st 9 records
            //var length = Math.min(cluster.length, 9);
            var length = cluster.length;
            var map_id = map.s3.id;
            for (var i = 0; i < length; i++) {
                var attributes = cluster[i].attributes;
                if (undefined != attributes.popup) {
                    // Only display the 1st line of the hover popup
                    name = attributes.popup.split('<br />', 1)[0];
                } else {
                    name = attributes[titleField];
                }
                if (undefined != attributes.url) {
                    contents += "<li><a href='javascript:S3.gis.loadClusterPopup(" + "\"" + map_id + "\", \"" + attributes.url + "\", \"" + popup_id + "\"" + ")'>" + name + "</a></li>";
                } else {
                    // @ToDo: Provide a way to load non-URL based popups
                    contents += '<li>' + name + '</li>';
                }
            }
            contents += '</ul>';
            contents += "<div align='center'><a href='javascript:S3.gis.zoomToSelectedFeature(" + "\"" + map_id + "\", " + centerPoint.lon + "," + centerPoint.lat + ", 3)'>" + i18n.gis_zoomin + '</a></div>';
        } else {
            // Single Feature
            if (layer_type == 'kml') {
                var attributes = feature.attributes;
                if (undefined != feature.style.balloonStyle) {
                    // Use the provided BalloonStyle
                    var balloonStyle = feature.style.balloonStyle;
                    // "<strong>{name}</strong><br /><br />{description}"
                    contents = balloonStyle.replace(/{([^{}]*)}/g,
                        function (a, b) {
                            var r = attributes[b];
                            return typeof r === 'string' || typeof r === 'number' ? r : a;
                        }
                    );
                } else {
                    // Build the Popup contents manually
                    var type = typeof attributes[titleField];
                    var title;
                    if ('object' == type) {
                        title = attributes[titleField].value;
                    } else {
                        title = attributes[titleField];
                    }
                    contents = '<h3>' + title + '</h3>';
                    var body = feature.layer.body.split(' ');
                    var label, row, value;
                    for (var j = 0; j < body.length; j++) {
                        type = typeof attributes[body[j]];
                        if ('object' == type) {
                            // Geocommons style
                            label = attributes[body[j]].displayName;
                            if (label === '') {
                                label = body[j];
                            }
                            value = attributes[body[j]].value;
                            row = '<div class="gis_popup_row"><div class="gis_popup_label">' + label +
                                  ':</div><div class="gis_popup_cell">' + value + '</div></div>';
                        } else if (undefined != attributes[body[j]]) {
                            row = '<div class="gis_popup_row">' + attributes[body[j]] + '</div>';
                        } else {
                            // How would we get here?
                            row = '';
                        }                    
                        contents += row;
                    }
                }
                // Protect the content against JavaScript attacks
                if (contents.search('<script') != -1) {
                    contents = 'Content contained Javascript! Escaped content below.<br />' + contents.replace(/</g, '<');
                }
            } else if (layer_type == 'gpx') {
                // @ToDo: display as many attributes as we can: Description (Points), Date, Author?, Lat, Lon
            } else if (layer_type == 'shapefile') {
                // We don't have control of attributes, so simply display all
                // @ToDo: have an optional style.popup (like KML's balloonStyle)
                var attributes = feature.attributes;
                contents = '<div>';
                var label, prop, row, value;
                $.each(attributes, function(label, value) {
                    if (label == 'id_orig') {
                        label = 'id';
                    }
                    row = '<div class="gis_popup_row"><div class="gis_popup_label">' + label +
                          ':</div><div class="gis_popup_cell">' + value + '</div></div>';
                    contents += row;
                });
                contents += '</div>';
            } else if (layer_type == 'wfs') {
                var attributes = feature.attributes;
                var title = attributes[titleField];
                contents = '<h3>' + title + '</h3>';
                var row;
                $.each(attributes, function(label, value) {
                    row = '<div class="gis_popup_row"><div class="gis_popup_label">' + label +
                          ':</div><div class="gis_popup_val">' + value + '</div></div>';
                    contents += row;
                });
            } else {
                // @ToDo: disambiguate these by type
                if (undefined != feature.attributes.url) {
                    // Popup contents are pulled via AJAX
                    popup_url = feature.attributes.url;
                    contents = i18n.gis_loading + "...<img src='" + ajax_loader + "' border=0 />";
                } else {
                    // Popup contents are built from the attributes
                    var attributes = feature.attributes;
                    if (undefined == attributes.name) {
                        name = '';
                    } else {
                        name = '<h3>' + attributes.name + '</h3>';
                    }
                    var description;
                    if (undefined == attributes.description) {
                        description = '';
                    } else {
                        description = '<p>' + attributes.description + '</p>';
                    }
                    var link;
                    if (undefined == attributes.link) {
                        link = '';
                    } else {
                        link = '<a href="' + attributes.link + '" target="_blank">' + attributes.link + '</a>';
                    }
                    var data;
                    if (undefined == attributes.data) {
                        data = '';
                    } else if (attributes.data.indexOf('http://') === 0) {
                        data_link = true;
                        var data_id = S3.uid();
                        data = '<div id="' + data_id + '">' + i18n.gis_loading + "...<img src='" + ajax_loader + "' border=0 />" + '</div>';
                    } else {
                        data = '<p>' + attributes.data + '</p>';
                    }
                    var image;
                    if (undefined == attributes.image) {
                        image = '';
                    } else if (attributes.image.indexOf('http://') === 0) {
                        image = '<img src="' + attributes.image + '" height=300 width=300>';
                    } else {
                        image = '';
                    }
                    contents = name + description + link + data + image;
                }
            }
        }
        var popup = new OpenLayers.Popup.FramedCloud(
            popup_id,
            centerPoint,
            new OpenLayers.Size(200, 200),
            contents,
            null,
            true,
            onPopupClose
        );
        if (undefined != popup_url) {
            // call AJAX to get the contentHTML
            loadDetails(popup_url, popup_id + '_contentDiv', popup);
        } else if (data_link) {
            // call AJAX to get the data
            loadDetails(feature.attributes.data, data_id, popup);
        }
        feature.popup = popup;
        //popup.feature = feature;
        map.addPopup(popup);
    }

    // Supports popupControl for All Vector Layers
    function onFeatureUnselect(event) {
        var feature = event.feature;
        if (feature.popup) {
            feature.layer.map.removePopup(feature.popup);
            feature.popup.destroy();
            delete feature.popup;
        }
    }
    function onPopupClose(event) {
        // Close all Popups
        // Close popups associated with features
        //popupControl.unselectAll();

        // @ToDo: Make this configurable to allow multiple popups open at once
        // Close ALL popups
        // inc orphaned Popups (e.g. from Refresh)
        var map = this.map;
        while (map.popups.length) {
            map.removePopup(map.popups[0]);
        }
    }

    // Toolbar Buttons
    var addToolbar = function(map) {
        var options = map.s3.options;

        //var toolbar = map.s3.mapPanelContainer.getTopToolbar();
        var toolbar = new Ext.Toolbar({
            //cls: 'gis_toolbar',
            // Height needed for the Throbber
            height: 34
        })
        toolbar.map = map;

        var zoomfull = new GeoExt.Action({
            control: new OpenLayers.Control.ZoomToMaxExtent(),
            map: map,
            iconCls: 'zoomfull',
            // button options
            tooltip: i18n.gis_zoomfull
        });

        var zoomout = new GeoExt.Action({
            control: new OpenLayers.Control.ZoomBox({ out: true }),
            map: map,
            iconCls: 'zoomout',
            // button options
            tooltip: i18n.gis_zoomout,
            toggleGroup: 'controls'
        });

        var zoomin = new GeoExt.Action({
            control: new OpenLayers.Control.ZoomBox(),
            map: map,
            iconCls: 'zoomin',
            // button options
            tooltip: i18n.gis_zoominbutton,
            toggleGroup: 'controls'
        });

        var polygon_pressed;
        var pan_pressed;
        var point_pressed;
        if (options.draw_polygon == 'active') {
            polygon_pressed = true;
            pan_pressed = false;
            point_pressed = false;
        } else if (options.draw_feature == 'active') {
            point_pressed = true;
            pan_pressed = false;
            polygon_pressed = false;
        } else {
            pan_pressed = true;
            point_pressed = false;
            polygon_pressed = false;
        }

        // Controls for Draft Features (unused)

        // var draftLayer = map.s3.draftLayer;
        //var selectControl = new OpenLayers.Control.SelectFeature(draftLayer, {
        //    onSelect: onFeatureSelect,
        //    onUnselect: onFeatureUnselect,
        //    multiple: false,
        //    clickout: true,
        //    isDefault: true
        //});

        //var removeControl = new OpenLayers.Control.RemoveFeature(draftLayer, {
        //    onDone: function(feature) {
        //        console.log(feature);
        //    }
        //});

        //var selectButton = new GeoExt.Action({
            //control: selectControl,
        //    map: map,
        //    iconCls: 'searchclick',
            // button options
        //    tooltip: 'T("Query Feature")',
        //    toggleGroup: 'controls',
        //    enableToggle: true
        //});

        //var lineButton = new GeoExt.Action({
        //    control: new OpenLayers.Control.DrawFeature(draftLayer, OpenLayers.Handler.Path),
        //    map: map,
        //    iconCls: 'drawline-off',
        //    tooltip: 'T("Add Line")',
        //    toggleGroup: 'controls'
        //});

        //var dragButton = new GeoExt.Action({
        //    control: new OpenLayers.Control.DragFeature(draftLayer),
        //    map: map,
        //    iconCls: 'movefeature',
        //    tooltip: 'T("Move Feature: Drag feature to desired location")',
        //    toggleGroup: 'controls'
        //});

        //var resizeButton = new GeoExt.Action({
        //    control: new OpenLayers.Control.ModifyFeature(draftLayer, { mode: OpenLayers.Control.ModifyFeature.RESIZE }),
        //    map: map,
        //    iconCls: 'resizefeature',
        //    tooltip: 'T("Resize Feature: Select the feature you wish to resize & then Drag the associated dot to your desired size")',
        //    toggleGroup: 'controls'
        //});

        //var rotateButton = new GeoExt.Action({
        //    control: new OpenLayers.Control.ModifyFeature(draftLayer, { mode: OpenLayers.Control.ModifyFeature.ROTATE }),
        //    map: map,
        //    iconCls: 'rotatefeature',
        //    tooltip: 'T("Rotate Feature: Select the feature you wish to rotate & then Drag the associated dot to rotate to your desired location")',
        //    toggleGroup: 'controls'
        //});

        //var modifyButton = new GeoExt.Action({
        //    control: new OpenLayers.Control.ModifyFeature(draftLayer),
        //    map: map,
        //    iconCls: 'modifyfeature',
        //    tooltip: 'T("Modify Feature: Select the feature you wish to deform & then Drag one of the dots to deform the feature in your chosen manner")',
        //    toggleGroup: 'controls'
        //});

        //var removeButton = new GeoExt.Action({
        //    control: removeControl,
        //    map: map,
        //    iconCls: 'removefeature',
        //    tooltip: 'T("Remove Feature: Select the feature you wish to remove & press the delete key")',
        //    toggleGroup: 'controls'
        //});

        /* Add controls to Map & buttons to Toolbar */

        toolbar.add(zoomfull);

        if (navigator.geolocation) {
            // HTML5 geolocation is available :)
            addGeolocateControl(toolbar);
        }

        // Don't include the Nav controls in the Location Selector
        if (undefined === options.loc_select) {
            var panButton = new GeoExt.Action({
                control: new OpenLayers.Control.Navigation(),
                map: map,
                iconCls: 'pan-off',
                // button options
                tooltip: i18n.gis_pan,
                allowDepress: true,
                toggleGroup: 'controls',
                pressed: pan_pressed
            });

            toolbar.add(zoomout);
            toolbar.add(zoomin);
            toolbar.add(panButton);
            toolbar.addSeparator();

            addNavigationControl(toolbar);
        }

        // Save Viewport
        if ((undefined === options.loc_select) && (S3.auth)) {
            addSaveButton(toolbar);
        }
        toolbar.addSeparator();

        // Measure Tools
        // @ToDo: Make these optional
        addMeasureControls(toolbar);

        // MGRS Grid PDFs
        if (options.mgrs_url) {
            addPdfControl(toolbar);
        }

        if (options.draw_feature || options.draw_polygon) {
            // Draw Controls
            toolbar.addSeparator();
            //toolbar.add(selectButton);
            if (options.draw_feature) {
                addPointControl(toolbar, point_pressed);
            }
            //toolbar.add(lineButton);
            if (options.draw_polygon) {
                addPolygonControl(toolbar, polygon_pressed, true);
            }
            //toolbar.add(dragButton);
            //toolbar.add(resizeButton);
            //toolbar.add(rotateButton);
            //toolbar.add(modifyButton);
            //toolbar.add(removeButton);
        }

        // WMS GetFeatureInfo
        // @ToDo: Add control if we add appropriate layers dynamically...
        if (i18n.gis_get_feature_info) {
            addWMSGetFeatureInfoControl(map);
        }

        // OpenStreetMap Editor
        if (options.osm_oauth) {
            addPotlatchButton(toolbar);
        }

        // Google Streetview
        if (options.Google && options.Google.StreetviewButton) {
            addGoogleStreetviewControl(toolbar);
        }

        // Google Earth
        try {
            // Only load Google layers if GoogleAPI downloaded ok
            // - allow rest of map to work offline
            if (options.Google.Earth) {
                google & addGoogleEarthControl(toolbar);
            }
        } catch(err) {}
        
        // Search box
        if (i18n.gis_search) {
            if (options.loc_select) {
                // LocationSelector has fewer toolbar buttons, so can handle a greater width
                // & this functionality is very useful here
                var max_width = options.map_width - 500;
            } else {
                // Leave space for the Layer Throbber
                var max_width = options.map_width - 680;
            }
            var width = Math.min(350, max_width);
            var mapSearch = new GeoExt.ux.GeoNamesSearchCombo({
                map: map,
                width: width,
                listWidth: width,
                minChars: 2,
                // @ToDo: Restrict to the Country if using a Country config
                //countryString: ,
                emptyText: i18n.gis_search
            });
            toolbar.addSeparator();
            toolbar.add(mapSearch);
        }
        
        // Throbber
        var throbber = new Ext.BoxComponent({
            autoEl: {
                tag: 'img',
                src: ajax_loader
            },
            cls: 'layer_throbber hide'
        });
        toolbar.add(throbber);

        return toolbar;
    }

    /* Toolbar Buttons */

    // Geolocate control
    // HTML5 GeoLocation: http://dev.w3.org/geo/api/spec-source.html
    var addGeolocateControl = function(toolbar) {
        var map = toolbar.map;

        // Use the Draft Features layer
        var draftLayer = map.s3.draftLayer;

        var style = {
            fillColor: '#000',
            fillOpacity: 0.1,
            strokeWidth: 0
        };

        var geolocateControl = new OpenLayers.Control.Geolocate({
            geolocationOptions: {
                enableHighAccuracy: false,
                maximumAge: 0,
                timeout: 7000
            }
        });
        map.addControl(geolocateControl);

        geolocateControl.events.register('locationupdated', this, function(e) {
            draftLayer.removeAllFeatures();
            var circle = new OpenLayers.Feature.Vector(
                OpenLayers.Geometry.Polygon.createRegularPolygon(
                    new OpenLayers.Geometry.Point(e.point.x, e.point.y),
                    e.position.coords.accuracy / 2,
                    40,
                    0
                ),
                {},
                style
            );
            draftLayer.addFeatures([
                new OpenLayers.Feature.Vector(
                    e.point,
                    {},
                    {
                        graphicName: 'cross',
                        strokeColor: '#f00',
                        strokeWidth: 2,
                        fillOpacity: 0,
                        pointRadius: 10
                    }
                ),
                circle
            ]);
            map.zoomToExtent(draftLayer.getDataExtent());
            s3_gis_pulsate(map, circle);
        });

        geolocateControl.events.register('locationfailed', this, function() {
            OpenLayers.Console.log('Location detection failed');
        });

        // Toolbar Button
        var geoLocateButton = new Ext.Toolbar.Button({
            iconCls: 'geolocation',
            tooltip: i18n.gis_geoLocate,
            handler: function() {
                draftLayer.removeAllFeatures();
                //geolocateControl.deactivate();
                //geolocateControl.watch = false;
                geolocateControl.activate();
            }
        });
        toolbar.addButton(geoLocateButton);
    }

    // Supports GeoLocate control
    // Needs to be in global scope as activated by user
    function s3_gis_pulsate(map, feature) {
        var point = feature.geometry.getCentroid(),
            bounds = feature.geometry.getBounds(),
            radius = Math.abs((bounds.right - bounds.left) / 2),
            count = 0,
            grow = 'up';

        var resize = function(){
            if (count > 16) {
                clearInterval(window.resizeInterval);
            }
            var interval = radius * 0.03;
            var ratio = interval / radius;
            switch(count) {
                case 4:
                case 12:
                    grow = 'down'; break;
                case 8:
                    grow = 'up'; break;
            }
            if (grow !== 'up') {
                ratio = - Math.abs(ratio);
            }
            feature.geometry.resize(1 + ratio, point);
            map.s3.draftLayer.drawFeature(feature);
            count++;
        };
        window.resizeInterval = window.setInterval(resize, 50, point, radius);
    }

    // Google Earth control
    var addGoogleEarthControl = function(toolbar) {
        var map = toolbar.map;
        var s3 = map.s3;
        // Toolbar Button
        var googleEarthButton = new Ext.Toolbar.Button({
            iconCls: 'googleearth',
            tooltip: s3.options.Google.Earth,
            enableToggle: true,
            toggleHandler: function(button, state) {
                if (state === true) {
                    s3.mapPanelContainer.getLayout().setActiveItem(1);
                    // Since the LayerTree isn't useful, collapse it
                    s3.mapWin.items.items[0].collapse();
                    s3.googleEarthPanel.on('pluginready', function() {
                        addGoogleEarthKmlLayers(map);
                    });
                } else {
                    s3.mapPanelContainer.getLayout().setActiveItem(0);
                    s3.mapWin.items.items[0].expand();
                }
            }
        });
        toolbar.addSeparator();
        toolbar.addButton(googleEarthButton);
    }

    // Supports GE Control
    function addGoogleEarthKmlLayers(map) {
        var layers_feature = map.s3.options.layers_feature;
        if (layers_feature) {
            for (var i = 0; i < layers_feature.length; i++) {
                var layer = layers_feature[i];
                var visibility;
                if (undefined != layer.visibility) {
                    visibility = layer.visibility;
                } else {
                    // Default to visible
                    visibility = true;
                }
                if (visibility) {
                    // @ToDo: Add Authentication when-required
                    var url = S3.public_url + layer.url.replace('geojson', 'kml');
                    google.earth.fetchKml(map.s3.googleEarthPanel.earth, url, googleEarthKmlLoaded);
                }
            }
        }
    }

    function googleEarthKmlLoaded(object) {
        if (!object) {
            return;
        }
        S3.gis.googleEarthPanel.earth.getFeatures().appendChild(object);
    }

    // Google Streetview control
    var addGoogleStreetviewControl = function(toolbar) {
        var map = toolbar.map;
        var Clicker = OpenLayers.Class(OpenLayers.Control, {
            defaults: {
                pixelTolerance: 1,
                stopSingle: true
            },
            initialize: function(options) {
                this.handlerOptions = OpenLayers.Util.extend(
                    {}, this.defaults
                );
                OpenLayers.Control.prototype.initialize.apply(this, arguments);
                this.handler = new OpenLayers.Handler.Click(
                    this, {click: this.trigger}, this.handlerOptions
                );
            },
            trigger: function(event) {
                openStreetviewPopup(map, map.getLonLatFromViewPortPx(event.xy));
            }
        });
        StreetviewClicker = new Clicker({autoactivate: false});
        map.addControl(StreetviewClicker);

        // Toolbar Button
        var googleStreetviewButton = new Ext.Toolbar.Button({
            iconCls: 'streetview',
            tooltip: map.s3.options.Google.StreetviewButton,
            allowDepress: true,
            enableToggle: true,
            toggleGroup: 'controls',
            toggleHandler: function(button, state) {
                if (state === true) {
                    StreetviewClicker.activate();
                } else {
                    StreetviewClicker.deactivate();
                }
            }
        });
        toolbar.addSeparator();
        toolbar.addButton(googleStreetviewButton);
    }

    // Supports Streetview Control
    function openStreetviewPopup(map, location) {
        if (!location) {
            location = map.getCenter();
        }
        // Only allow 1 SV Popup/map
        if (map.s3.sv_popup && map.s3.sv_popup.anc) {
            map.s3.sv_popup.close();
        }
        map.s3.sv_popup = new GeoExt.Popup({
            title: map.s3.options.Google.StreetviewTitle,
            location: location,
            width: 300,
            height: 300,
            collapsible: true,
            map: map.s3.mapPanel,
            items: [new gxp.GoogleStreetViewPanel()]
        });
        map.s3.sv_popup.show();
    }

    // Measure Controls
    var addMeasureControls = function(toolbar) {
        var map = toolbar.map;
        // Common components
        var measureSymbolizers = {
            'Point': {
                pointRadius: 5,
                graphicName: 'circle',
                fillColor: 'white',
                fillOpacity: 1,
                strokeWidth: 1,
                strokeOpacity: 1,
                strokeColor: '#f5902e'
            },
            'Line': {
                strokeWidth: 3,
                strokeOpacity: 1,
                strokeColor: '#f5902e',
                strokeDashstyle: 'dash'
            },
            'Polygon': {
                strokeWidth: 2,
                strokeOpacity: 1,
                strokeColor: '#f5902e',
                fillColor: 'white',
                fillOpacity: 0.5
            }
        };
        var styleMeasure = new OpenLayers.Style();
        styleMeasure.addRules([
            new OpenLayers.Rule({symbolizer: measureSymbolizers})
        ]);
        var styleMapMeasure = new OpenLayers.StyleMap({'default': styleMeasure});

        // Length Button
        var length = new OpenLayers.Control.Measure(
            OpenLayers.Handler.Path, {
                geodesic: true,
                persist: true,
                handlerOptions: {
                    layerOptions: {styleMap: styleMapMeasure}
                }
            }
        );
        length.events.on({
            'measure': function(evt) {
                alert(i18n.gis_length_message + ' ' + evt.measure.toFixed(2) + ' ' + evt.units);
            }
        });

        // Toolbar Buttons
        // 1st of these 2 to get activated cannot be deselected!
        var lengthButton = new GeoExt.Action({
            control: length,
            map: map,
            iconCls: 'measure-off',
            // button options
            tooltip: i18n.gis_length_tooltip,
            allowDepress: true,
            enableToggle: true,
            toggleGroup: 'controls'
        });

        toolbar.add(lengthButton);

        // Don't include the Area button in the Location Selector
        if (undefined === map.s3.options.loc_select) {
            // Area Button
            var area = new OpenLayers.Control.Measure(
                OpenLayers.Handler.Polygon, {
                    geodesic: true,
                    persist: true,
                    handlerOptions: {
                        layerOptions: {styleMap: styleMapMeasure}
                    }
                }
            );
            area.events.on({
                'measure': function(evt) {
                    alert(i18n.gis_area_message + ' ' + evt.measure.toFixed(2) + ' ' + evt.units + '2');
                }
            });

            var areaButton = new GeoExt.Action({
                control: area,
                map: map,
                iconCls: 'measure-area',
                // button options
                tooltip: i18n.gis_area_tooltip,
                allowDepress: true,
                enableToggle: true,
                toggleGroup: 'controls'
            });

            toolbar.add(areaButton);
        }
    }

    // Navigation History
    var addNavigationControl = function(toolbar) {
        var nav = new OpenLayers.Control.NavigationHistory();
        toolbar.map.addControl(nav);
        nav.activate();
        // Toolbar Buttons
        var navPreviousButton = new Ext.Toolbar.Button({
            iconCls: 'back',
            tooltip: i18n.gis_navPrevious,
            handler: nav.previous.trigger
        });
        var navNextButton = new Ext.Toolbar.Button({
            iconCls: 'next',
            tooltip: i18n.gis_navNext,
            handler: nav.next.trigger
        });
        toolbar.addButton(navPreviousButton);
        toolbar.addButton(navNextButton);
    }

    // Point Control to add new Markers to the Map
    var addPointControl = function(toolbar, active) {
        var map = toolbar.map;
        OpenLayers.Handler.PointS3 = OpenLayers.Class(OpenLayers.Handler.Point, {
            // Ensure that we propagate Double Clicks (so we can still Zoom)
            dblclick: function(evt) {
                //OpenLayers.Event.stop(evt);
                return true;
            },
            CLASS_NAME: 'OpenLayers.Handler.PointS3'
        });

        var draftLayer = map.s3.draftLayer;
        var control = new OpenLayers.Control.DrawFeature(draftLayer, OpenLayers.Handler.PointS3, {
            // custom Callback
            'featureAdded': function(feature) {
                // Remove previous point
                if (map.s3.lastDraftFeature) {
                    map.s3.lastDraftFeature.destroy();
                } else if (draftLayer.features.length > 1) {
                    // Clear the one from the Current Location in S3LocationSelector
                    draftLayer.features[0].destroy();
                }
                var lon_field = $('#gis_location_lon');
                if (lon_field.length) {
                    // Update form fields in S3LocationSelectorWidget
                    // (S3LocationSelectorWidget2 does this in s3.locationselector.widget2.js, which is a better design)
                    var centerPoint = feature.geometry.getBounds().getCenterLonLat();
                    centerPoint.transform(map.getProjectionObject(), proj4326);
                    lon_field.val(centerPoint.lon);
                    $('#gis_location_lat').val(centerPoint.lat);
                    $('#gis_location_wkt').val('');
                }
                // Prepare in case user selects a new point
                map.s3.lastDraftFeature = feature;
            }
        })

        if (toolbar) {
            // Toolbar Button
            var pointButton = new GeoExt.Action({
                control: control,
                handler: function() {
                    if (pointButton.items[0].pressed) {
                        $('.olMapViewport').addClass('crosshair');
                    } else {
                        $('.olMapViewport').removeClass('crosshair');
                    }
                },
                map: map,
                iconCls: 'drawpoint-off',
                tooltip: i18n.gis_draw_feature,
                allowDepress: true,
                enableToggle: true,
                toggleGroup: 'controls',
                pressed: active
            });
            toolbar.add(pointButton);
            // Pass to Global scope for LocationSelectorWidget
            map.s3.pointButton = pointButton;
        } else {
            // Simply add straight to the map
            map.addControl(control);
            if (active) {
                control.activate();
                $('.olMapViewport').addClass('crosshair');
            }
        }
    }

    // Polygon Control to select Areas on the Map
    var addPolygonControl = function(toolbar, polygon_pressed, not_regular) {
        var map = toolbar.map;
        // Toolbar Button
        var polygonButton = new GeoExt.Action({
            // We'd like to use the Polygon, but this is hard to use server-side as a Resource filter
            //control: new OpenLayers.Control.DrawFeature(map.s3.draftLayer, OpenLayers.Handler.Polygon, {
            control: new OpenLayers.Control.DrawFeature(map.s3.draftLayer,
                              not_regular ? OpenLayers.Handler.Polygon :
                                            OpenLayers.Handler.RegularPolygon, {
                handlerOptions: not_regular ? {
                    sides: 4,
                    snapAngle: 90
                } : {},
                // custom Callback
                'featureAdded': function(feature) {
                    // Remove previous polygon
                    if (map.s3.lastDraftFeature) {
                        map.s3.lastDraftFeature.destroy();
                    }
                    // update Form Field
                    var WKT = feature.geometry.transform(map.getProjectionObject(), proj4326).toString();
                    $('#gis_search_polygon_input').val(WKT).trigger('change');
                    $('#gis_location_wkt').val(WKT);
                    $('#gis_location_lat').val('');
                    $('#gis_location_lon').val('');
                    // Prepare in case user draws a new polygon
                    map.s3.lastDraftFeature = feature;
                }
            }),
            handler: function(){
                if (polygonButton.items[0].pressed) {
                    $('.olMapViewport').addClass('crosshair');
                } else {
                    $('.olMapViewport').removeClass('crosshair');
                }
            },
            map: map,
            iconCls: 'drawpolygon-off',
            tooltip: i18n.gis_draw_polygon,
            allowDepress: true,
            enableToggle: true,
            toggleGroup: 'controls',
            pressed: polygon_pressed,
            activateOnEnable: true,
            deactivateOnDisable: true
        });
        toolbar.add(polygonButton);
        // Pass to global scope
        map.s3.polygonButton = polygonButton;
    }

    // Potlatch button for editing OpenStreetMap
    // @ToDo: Select a Polygon for editing rather than the whole Viewport
    var addPotlatchButton = function(toolbar) {
        var map = toolbar.map;
        // Toolbar Button
        var potlatchButton = new Ext.Toolbar.Button({
            iconCls: 'potlatch',
            tooltip: i18n.gis_potlatch,
            handler: function() {
                // Read current settings from map
                var zoom_current = map.getZoom();
                if ( zoom_current < 14 ) {
                    alert(map.s3.options.osm_oauth);
                } else {
                    var lonlat = map.getCenter();
                    // Convert back to LonLat for saving
                    lonlat.transform(map.getProjectionObject(), proj4326);
                    var url = S3.Ap.concat('/gis/potlatch2/potlatch2.html') + '?lat=' + lonlat.lat + '&lon=' + lonlat.lon + '&zoom=' + zoom_current;
                    window.open(url);
                }
            }
        });
        toolbar.addSeparator();
        toolbar.addButton(potlatchButton);
    }

    // Save button to save the Viewport settings
    var addSaveButton = function(toolbar) {
        var config_id = toolbar.map.s3.options.config_id;
        // Toolbar Button
        var saveButton = new Ext.Toolbar.Button({
            iconCls: 'save',
            tooltip: i18n.gis_save,
            handler: function() {
                // Read current settings from map
                var state = getState(map);
                var layersStr = Ext.util.JSON.encode(state.layers);
                var pluginsStr = Ext.util.JSON.encode(state.plugins);
                // Use AJAX to send back
                var url;
                if (config_id) {
                    url = S3.Ap.concat('/gis/config/' + config_id + '.url/update');
                } else {
                    url = S3.Ap.concat('/gis/config.url/create');
                }
                Ext.Ajax.request({
                    url: url,
                    method: 'POST',
                    // @ToDo: Make the return value visible to the user
                    success: function(response, opts) {
                        var obj = Ext.decode(response.responseText);
                        var id = obj.message.split('=', 2)[1];
                        if (id) {
                            // Ensure that future saves are updates, not creates
                            config_id = id;
                            // Change the Menu link
                            var url = S3.Ap.concat('/gis/config/', id, '/layer_entity');
                            $('#gis_menu_config').attr('href', url);
                        }
                    },
                    //failure: otherFn,
                    params: {
                        lat: state.lat,
                        lon: state.lon,
                        zoom: state.zoom,
                        layers: layersStr,
                        plugins: pluginsStr
                    }
                });
            }
        });
        toolbar.addSeparator();
        toolbar.addButton(saveButton);
    }

    // Get the State of the Map
    // so that it can be Saved & Reloaded later
    // @ToDo: so that it can be Saved for Printing
    // @ToDo: so that a Bookmark can be shared
    function getState(map) {

        // State stored a a JSON array
        var state = {};

        // Viewport
        var lonlat = map.getCenter();
        // Convert back to LonLat for saving
        lonlat.transform(map.getProjectionObject(), proj4326);
        state.lon = lonlat.lon;
        state.lat = lonlat.lat;
        state.zoom = map.getZoom();

        // Layers
        // - Visible
        // @ToDo: Popups
        // @ToDo: Filters
        // @ToDo: WMS Browser
        var layers = [];
        var id, layer_config;
        var base_id = map.baseLayer.s3_layer_id;
        Ext.iterate(map.layers, function(key, val, obj) {
            id = key.s3_layer_id;
            layer_config = {
                id: id
            };
            // Only return non-default options
            if (key.visibility) {
                layer_config['visible'] = key.visibility;
            }
            if (id == base_id) {
                layer_config['base'] = true;
            }
            if (key.s3_style) {
                layer_config['style'] = key.s3_style;
            }
            layers.push(layer_config);
        });
        state.layers = layers;

        // Plugins
        var plugins = [];
        Ext.iterate(map.s3.plugins, function(key, val, obj) {
            if (key.getState) {
                plugins.push(key.getState());
            }
        });
        state.plugins = plugins;

        return state;
    }

    // MGRS Grid PDF Control
    // select an area on the map to download the grid's PDF to print off
    var addPdfControl = function(toolbar) {
        var map = toolbar.map;
        var options = map.s3.options;
        selectPdfControl = new OpenLayers.Control();
        OpenLayers.Util.extend( selectPdfControl, {
            draw: function () {
                this.box = new OpenLayers.Handler.Box( this, {
                        'done': this.getPdf
                    });
                this.box.activate();
                },
            response: function(req) {
                this.w.destroy();
                var gml = new OpenLayers.Format.GML();
                var features = gml.read(req.responseText);
                var html = features.length + ' pdfs. <br /><ul>';
                if (features.length) {
                    for (var i = 0; i < features.length; i++) {
                        var f = features[i];
                        var text = f.attributes.utm_zone + f.attributes.grid_zone + f.attributes.grid_square + f.attributes.easting + f.attributes.northing;
                        html += "<li><a href='" + features[i].attributes.url + "'>" + text + '</a></li>';
                    }
                }
                html += '</ul>';
                this.w = new Ext.Window({
                    'html': html,
                    width: 300,
                    'title': 'Results',
                    height: 200
                });
                this.w.show();
            },
            getPdf: function (bounds) {
                var current_projection = map.getProjectionObject()
                var ll = map.getLonLatFromPixel(new OpenLayers.Pixel(bounds.left, bounds.bottom)).transform(current_projection, proj4326);
                var ur = map.getLonLatFromPixel(new OpenLayers.Pixel(bounds.right, bounds.top)).transform(current_projection, proj4326);
                var boundsgeog = new OpenLayers.Bounds(ll.lon, ll.lat, ur.lon, ur.lat);
                bbox = boundsgeog.toBBOX();
                OpenLayers.Request.GET({
                    url: options.mgrs_url + '&bbox=' + bbox,
                    callback: OpenLayers.Function.bind(this.response, this)
                });
                this.w = new Ext.Window({
                    // @ToDo: i18n
                    'html':'Searching ' + options.mgrs_name + ', please wait.',
                    width: 200,
                    // @ToDo: i18n
                    'title': 'Please Wait.'
                    });
                this.w.show();
            }
        });

        // @ToDo: i18n
        var tooltip = 'Select ' + options.mgrs_name;
        // Toolbar Button
        var mgrsButton = new GeoExt.Action({
            text: tooltip,
            control: selectPdfControl,
            map: map,
            allowDepress: false,
            toggleGroup: 'controls',
            tooltip: tooltip
            // check item options group: 'draw'
        });
        toolbar.addSeparator();
        toolbar.add(mgrsButton);
    }

    // WMS GetFeatureInfo control
    var addWMSGetFeatureInfoControl = function(map) {
        var wmsGetFeatureInfo = new gxp.plugins.WMSGetFeatureInfo({
            actionTarget: 'gis_toolbar',
            outputTarget: 'map',
            outputConfig: {
                width: 400,
                height: 200
            },
            toggleGroup: 'controls',
            // html not permitted by Proxy
            format: "grid",
            infoActionTip: i18n.gis_get_feature_info,
            popupTitle: i18n.gis_feature_info
        });
        // Set up shortcut to allow GXP Plugin to work (needs to find portal)
        wmsGetFeatureInfo.target = map.s3;
        // @ToDo: Why do we need to toggle the Measure control before this works?
        //wmsGetFeatureInfo.activate();
        wmsGetFeatureInfo.addActions();
    }

    // Add/Remove Layers control
    var addRemoveLayersControl = function(map, layerTree) {
        var addLayersControl = new gxp.plugins.AddLayers({
            actionTarget: 'treepanel.tbar',
            // @ToDo: i18n
            addActionTip: 'Add layers',
            addActionMenuText: 'Add layers',
            addServerText: 'Add a New Server',
            doneText: 'Done',
            // @ToDo: CSW
            //search: true,
            upload: {
                // @ToDo
                url: null
            },
            uploadText: i18n.gis_uploadlayer,
            relativeUploadOnly: false
        });

        // @ToDo: Populate this from disabled Catalogue Layers (to which the user has access)
        // Use WMStore for the GeoServer which we can write to?
        // Use current layerStore for Removelayer()?
        //var store = map.s3.mapPanel.layers;
        var store = new GeoExt.data.LayerStore();

        // Set up shortcuts to allow GXP Plugin to work
        addLayersControl.target = layerTree;
        layerTree.proxy = OpenLayers.ProxyHost; // Required for 'Add a New Server'
        layerTree.layerSources = {};
        layerTree.layerSources['local'] = new gxp.plugins.LayerSource({
            title: 'local',
            store: store
        });
        var actions = addLayersControl.addActions();
        actions[0].enable();

        // @ToDo: Ensure that this picks up when a layer is highlighted
        var removeLayerControl = new gxp.plugins.RemoveLayer({
            actionTarget: 'treepanel.tbar',
            // @ToDo: i18n
            removeActionTip: 'Remove layer'
        });
        // Set up shortcuts to allow GXP Plugin to work
        removeLayerControl.target = layerTree;
        layerTree.mapPanel = map.s3.mapPanel;
        removeLayerControl.addActions();
    }

    // Layer Properties control
    var addLayerPropertiesButton = function(map, layerTree) {
        // Ensure just 1 propertiesWindow per map
        var propertiesWindow = map.s3.propertiesWindow;
        var layerPropertiesButton = new Ext.Toolbar.Button({
            iconCls: 'gxp-icon-layerproperties',
            tooltip: i18n.gis_properties,
            handler: function() {
                // Find the Selected Node
                function isSelected(node) {
                    var selected = node.isSelected();
                    if (selected) {
                        if (!node.leaf) {
                            // Don't try & open Properties for a Folder
                            return false;
                        } else {
                            return true;
                        }
                    } else {
                        return false;
                    }
                }
                var node = layerTree.root.findChildBy(isSelected, null, true);
                if (node) {
                    var layer_type = node.layer.s3_layer_type;
                    var url = S3.Ap.concat('/gis/layer_' + layer_type + '.plain?layer_' + layer_type + '.layer_id=' + node.layer.s3_layer_id + '&update=1');
                    Ext.Ajax.request({
                        url: url,
                        method: 'GET',
                        success: function(response, opts) {
                            // Close any existing window on this map
                            if (propertiesWindow) {
                                propertiesWindow.close();
                            }
                            var tabPanel;
                            if (layer_type == 'feature') {
                                tabPanel = new Ext.TabPanel({
                                    activeTab: 0,
                                    items: [
                                        {
                                            // Tab to View/Edit Basic Details
                                            // @ToDo: i18n
                                            title: 'Layer Properties',
                                            html: response.responseText
                                        }, {
                                            // Tab for Search Widget
                                            // @ToDo: i18n
                                            title: 'Filter',
                                            id: 's3_gis_layer_filter_tab',
                                            html: ''
                                        }
                                        // @ToDo: Tab for Styling (esp. Thematic Mapping)
                                        ]
                                });
                                tabPanel.items.items[1].on('activate', function() {
                                    // Find which search form to load
                                    // @ToDo: Look for overrides (e.g. Warehouses/Staff/Volunteers)
                                    // @ToDo: Read current filter settings to default widgets to
                                    var search_url;
                                    Ext.iterate(map.s3.layers_feature, function(key, val, obj) {
                                        if (key.id == node.layer.s3_layer_id) {
                                            //search_url = S3.Ap.concat('/' + module + '/' + resource + '/search.plain');
                                            search_url = key.url.replace(/.geojson.+/, '/search.plain');
                                        }
                                    });
                                    // @ToDo: Support more than 1/page
                                    Ext.get('s3_gis_layer_filter_tab').load({
                                        url: search_url,
                                        discardUrl: false,
                                        callback: function() {
                                            // Activate Help Tooltips
                                            S3.addTooltips();
                                            // Handle Options Widgets with collapsed options
                                            S3.search.select_letter_label();
                                        },
                                        // @ToDo: i18n
                                        text: 'Loading...',
                                        timeout: 30,
                                        scripts: false
                                    });
                                });
                            } else {
                                tabPanel = new Ext.Panel({
                                    // View/Edit Basic Details
                                    // @ToDo: i18n
                                    title: 'Layer Properties',
                                    html: response.responseText
                                });
                            }
                            propertiesWindow = new Ext.Window({
                                width: 400,
                                layout: 'fit',
                                items: [ tabPanel ]
                            });
                            propertiesWindow.show();
                            // Set the form to use AJAX submission
                            $('#plain form').submit(function() {
                                var id = $('#plain input[name="id"]').val();
                                var update_url = S3.Ap.concat('/gis/layer_' + layer_type + '/' + id + '.plain/update');
                                var fields = $('#plain input');
                                var ids = [];
                                Ext.iterate(fields, function(key, val, obj) {
                                    if (val.id && (val.id.indexOf('gis_layer_') != -1)) {
                                        ids.push(val.id);
                                    }
                                });
                                var pcs = [];
                                for (i=0; i < ids.length; i++) {
                                    q = $('#' + ids[i]).serialize();
                                    if (q) {
                                        pcs.push(q);
                                    }
                                }
                                q = $('#plain input[name="id"]').serialize();
                                if (q) {
                                    pcs.push(q);
                                }
                                q = $('#plain input[name="_formkey"]').serialize();
                                if (q) {
                                    pcs.push(q);
                                }
                                q = $('#plain input[name="_formname"]').serialize();
                                if (q) {
                                    pcs.push(q);
                                }
                                if (pcs.length > 0) {
                                    var query = pcs.join("&");
                                    $.ajax({
                                        type: 'POST',
                                        url: update_url,
                                        data: query,
                                        success: function(msg) {
                                            $('#plain').html(msg);
                                        }
                                    });
                                }
                                return false;
                            });
                            // Activate Help Tooltips
                            S3.addTooltips();
                            // Activate RoleRequired autocomplete
                            S3.autocomplete('role', 'admin', 'group', 'gis_layer_' + layer_type + '_role_required');
                        }
                    });
                }
            }
        });
        var toolbar = layerTree.getTopToolbar();
        toolbar.add(layerPropertiesButton);
    }

}());
// END ========================================================================