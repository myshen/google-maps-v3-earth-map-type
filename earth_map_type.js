// EarthMapType masquerades as a base MapType but it is actually an overlay.
// It uses Overlay information to create a plugin container that matches the 
// DOM size for the map.
//
// This class extends OverlayView.
//
// Constructor
// ===========
//
// EarthMapType(map?:google.maps.Map) | A Google Earth plugin instance that is
//                                      linked to the given map.
//
// Events
// ======
//
// initialized | None | This event is fired when the earth container and plugin
//                      is loaded and linked to the given map. Wait for this if
//                      you want to do anything with the earth
//                      plugin/graticules.
//
// Usage
// =====
//
//    var Earth = new EarthMapType(map);
//
// EarthMapType will add itself to the Map's registered MapTypeIds as "Earth".
//
// WARNING: Don't try to bind two EarthMapTypes to one map. There's currently
// only one linker per map.
//
// TODO Hide functions inside closures that don't need to be accessible by others.
//
// This work is licensed under the Creative Commons Attribution 3.0 Unported
// License. To view a copy of this license, visit
// http://creativecommons.org/licenses/by/3.0/ or send a letter to Creative
// Commons, 171 Second Street, Suite 300, San Francisco, California, 94105,
// USA.
//
// Matthew Shen 2011
//
var EarthMapType = (function () {
  function LOG() {
    if (console && console.log) {
      console.log(arguments);
    } else {
      alert(arguments);
    }
  }

  function origin() {
    var uriparts = [window.location.protocol, '//', window.location.host];
    uriparts = uriparts.concat(arguments.length > 0 ? arguments : []);
    return uriparts.join('');
  }

  function position(obj) {
    if (!obj) {
      return [0, 0];
    }
    var ppos = position(obj.offsetParent);
    return [obj.offsetLeft + ppos[0], obj.offsetTop + ppos[1]];
  }

  function wrapFn(fn, extensionfn, opts) {
    function wrapped() {
      if (opts && opts.extendBefore) {
        extensionfn.apply(this, arguments);
      }
      fn.apply(this, arguments);
      if (!opts || !opts.extendBefore) {
        extensionfn.apply(this, arguments);
      }
    };
    if (opts && opts.prototype) {
      wrapped.prototype = new fn();
    }
    return wrapped;
  }

  function makeIframeShim() {
    var shim = document.createElement('IFRAME');
    shim.src = 'javascript:false';
    shim.style.position = 'absolute';
    shim.style.border = 'none';
    return shim;
  }

  var magicShimOffset = -7;

  function setIframeShim(shim, shimmed) {
    var pos = position(shimmed);
    shim.style.visibility = 'visible';
    shim.style.width = shimmed.offsetWidth + 'px';
    shim.style.height = shimmed.offsetHeight + 'px';
    shim.style.left = pos[0] + magicShimOffset + 'px';
    shim.style.top = pos[1] + magicShimOffset + 'px';
    shimmed.parentNode.appendChild(shim);
    shimmed.style.zIndex = shim.style.zIndex + 1;
  }

  // The Linker is based off of how google.maps.Map,
  // google.maps.StreetViewPanorama, and google.maps.Marker collaborate to
  // allow markers to be duplicated in both Map and StreetView.
  var Linker = (function () {
    function Linker() {
      this.map = {};
      this.next_id = 0;
      this.name = 'earthlink';
      this.id_name = ['__', this.name, '_id'].join('');
    }
    Linker.prototype.getId = function (obj) {
      if (obj[this.id_name] === null || obj[this.id_name] == undefined) {
        obj[this.id_name] = this.next_id;
        this.next_id += 1;
      }
      return obj[this.id_name];
    };
    // XXX HACK Hypothesize that marker is an API marker.
    // Perhaps there is a way to find out when the Map is initializing and
    // ignore setMaps during that time?
    Linker.prototype.likelyNotUserMarker = function (obj) {
      // This seems to be an API marker for street view or cursor
      return obj instanceof google.maps.Marker && !obj.get('clickable') &&
             obj.get('draggable') && !obj.get('raiseOnDrag');
    };
    Linker.prototype.add = function (obj) {
      var k = this.getId(obj);
      if (!this.map[k]) {
        this.map[k] = obj;
        google.maps.event.trigger(this, 'insert', obj);
      }
    };
    Linker.prototype.remove = function (obj) {
      var k = this.getId(obj);
      if (this.map[k]) {
        delete this.map[k];
        google.maps.event.trigger(this, 'remove', obj);
      }
    };
    Linker.prototype.contains = function (obj) {
      var k = this.getId(obj);
      if (this.map[k]) {
        return true;
      }
      return false;
    };
    Linker.prototype.forEach = function (fn) {
      for (var i in this.map) {
        this.map.hasOwnProperty(i) && fn.call(this, this.map[i]);
      }
    };

    return Linker;
  })();

  // Maps google.maps.Map overlays into their corresponding representations in
  // google.earth
  function MapToEarth(earth) {
    var self = this;
    this.bindTo('linker', earth);
    this.bindTo('earth_plugin', earth);
    this.rTzRatio = 0.6;

    this.map_earth = {};
    this.earth_map = {};

    // Extend map_change events to change linker to reflect the same state.
    function linkMapChanges() {
      this._map && this._map[self.get('linker').name].remove(this);
      (this._map = this.get('map')) &&
         this._map[self.get('linker').name].add(this);
    }
    google.maps.MarkerImage = wrapFn(
      google.maps.MarkerImage,
      function (url, size, origin, anchor, scaledSize) {
        this.url = url;
        this.origin = origin;
      }, {prototype: true});
    // TODO Watch out. If you set the map as a property in the constructor some
    // of the overlay mappers don't work yet. Set the map after constructing.
    google.maps.Marker.prototype.map_changed = wrapFn(
      google.maps.Marker.prototype.map_changed, linkMapChanges);
    google.maps.Polyline.prototype.map_changed = wrapFn(
      google.maps.Polyline.prototype.map_changed, linkMapChanges);
    google.maps.Polygon.prototype.map_changed = wrapFn(
      google.maps.Polygon.prototype.map_changed, linkMapChanges);
    google.maps.Circle.prototype.map_changed = wrapFn(
      google.maps.Circle.prototype.map_changed, linkMapChanges);
    google.maps.Rectangle.prototype.map_changed = wrapFn(
      google.maps.Rectangle.prototype.map_changed, linkMapChanges);
    google.maps.KmlLayer.prototype.map_changed = wrapFn(
      google.maps.KmlLayer.prototype.map_changed, linkMapChanges);
    // TODO other Overlays

    function insert(x) {
      self.insert(x);
    }
    function remove(x) {
      self.remove(x);
    }
    this.get('linker').forEach(insert);
    google.maps.event.addListener(this.get('linker'), 'insert', insert);
    google.maps.event.addListener(this.get('linker'), 'remove', remove);
  }

  function addMVCFollower(listeners, obj, eventName, callback) {
    listeners.push(google.maps.event.addListener(
                     obj, eventName, callback));
    callback();
  }

  MapToEarth.prototype = new google.maps.MVCObject();
  MapToEarth.prototype.insert = function (x) {
    var self = this;
    if (this.get('linker').likelyNotUserMarker(x)) {
      return;
    }

    function doInsert(mapobj, placemark, listeners) {
      if (!placemark) {
        return;
      }
      var ge = self.get('earth_plugin');
      ge.getFeatures().appendChild(placemark);
      self.map_earth[self.get('linker').getId(mapobj)] =
        [placemark, listeners];
      self.earth_map[placemark] = mapobj;
    }

    if (x instanceof google.maps.Marker) {
      this.createMarker(x, doInsert);
    } else if (x instanceof google.maps.Polyline) {
      this.createPolyline(x, doInsert);
    } else if (x instanceof google.maps.Polygon) {
      this.createPolygon(x, doInsert);
    } else if (x instanceof google.maps.KmlLayer) {
      this.createKmlLayer(x, doInsert);
    } else if (x instanceof google.maps.Circle) {
      this.createCircle(x, doInsert);
    } else if (x instanceof google.maps.Rectangle) {
      this.createRectangle(x, doInsert);
    } else {
      LOG('unrecognized', x);
    }
  };
  MapToEarth.prototype.remove = function (x) {
    var ge = this.get('earth_plugin');
    var k = this.get('linker').getId(x);
    var earthobj = this.map_earth[k];
    var placemark = earthobj[0];
    var listeners = earthobj[1];
    if (listeners) {
      listeners.forEach(function (x) {
        google.maps.event.removeListener(x);
      });
    }
    ge.getFeatures().removeChild(placemark);
    this.map_earth[k] = null;
    this.earth_map[placemark] = null;
  };
  MapToEarth.prototype.rangeToZoom = function(range) {
    return Math.round(26 - (Math.log(range * this.rTzRatio) / Math.log(2)));
  }
  MapToEarth.prototype.zoomToRange = function(zoom) {
    return Math.pow(2, 26 - zoom) / this.rTzRatio;
  }
  MapToEarth.prototype.hexColorAndAlphaToEarthColor = function (hex, alpha) {
    if (hex && hex[0] == '#') {
      hex = hex.slice(1);
    }
    if (!hex || (hex.length != 6 && hex.length != 3)) {
      hex = '#ff000000';
    }
    if (hex.length == 3) {
      hex = [hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]].join('');
    }
    var r = hex.slice(0, 2);
    var g = hex.slice(2, 4);
    var b = hex.slice(4, 6);
    var a = Math.floor(parseInt('ff', 16) * alpha).toString(16);
    if (a.length < 2) {
      a = '0' + a;
    }
    return ['#', a, b, g, r].join('');
  };
  // http://code.google.com/apis/earth/documentation/geometries.html#circles
  MapToEarth.prototype.makeCircleLinearRing = function (ge, centerLat, centerLng, radius) {
    var ring = ge.createLinearRing('');
    var steps = 25;
    var pi2 = Math.PI * 2;
    for (var i = 0; i < steps; i++) {
      var lat = centerLat + radius * Math.cos(i / steps * pi2);
      var lng = centerLng + radius * Math.sin(i / steps * pi2);
      ring.getCoordinates().pushLatLngAlt(lat, lng, 0);
    }
    return ring;
  }
  // TODO This is a BIG TODO. These creators are not complete.
  MapToEarth.prototype.createMarker = function (marker, doInsert) {
    var ge = this.get('earth_plugin');
    var listeners = new google.maps.MVCArray();

    var placemark = ge.createPlacemark('');
    var point = ge.createPoint('');

    addMVCFollower(listeners, marker, 'position_changed', function () {
      var latlng = marker.getPosition();
      if (latlng) {
        point.setLatLng(latlng.lat(), latlng.lng());
        placemark.setGeometry(point);
      }
    });

    function iconChanged() {
      if (marker.getIcon()) {
        var url = marker.getIcon().url;
        var absurl = url;
        if (absurl[0] == '/') {
          absurl = origin() + absurl;
        }
        var mapImg = new Image();
        mapImg.src = absurl;
        mapImg.onload = function () {
          var mapHeight = mapImg.height;
          var icoWidth = marker.getIcon().size.width,
              icoHeight = marker.getIcon().size.height;
          // TODO plugin seems to ignores gx so there's currently no way to do
          // sprites.
          var iconStyle = ge.parseKml([
            '<Style>',
              '<IconStyle>',
                '<Icon>',
                  //'<gx:x>', marker.getIcon().origin.x, '</gx:x>',
                  //'<gx:y>', mapHeight - marker.getIcon().origin.y -
                  //          icoHeight, '</gx:y>',
                  //'<gx:w>', icoWidth, '</gx:w>',
                  //'<gx:h>', icoHeight / 3, '</gx:h>',
                '</Icon>',
              '</IconStyle>',
            '</Style>'
          ].join(''));
          var anchor = marker.getIcon().anchor;
          iconStyle.getIconStyle().getHotSpot().set(
            anchor.x, ge.UNITS_PIXELS, icoHeight - anchor.y, ge.UNITS_PIXELS);
          iconStyle.getIconStyle().getIcon().setHref(absurl);
          iconStyle.getIconStyle().setScale(
            Math.min(icoWidth, icoHeight) / 32.0);
          placemark.setStyleSelector(iconStyle);
        };
      } else {
        var style = ge.createStyle('');
        var icon = ge.createIcon('');
        icon.setHref(
          'http://maps.google.com/mapfiles/kml/paddle/red-circle.png');
        style.getIconStyle().getHotSpot().set(32, ge.UNITS_PIXELS,
                                              1, ge.UNITS_PIXELS);
        style.getIconStyle().setIcon(icon);
        style.getIconStyle().setScale(1);
        placemark.setStyleSelector(style);
      }
    }
    addMVCFollower(listeners, marker, 'icon_changed', iconChanged);

    addMVCFollower(listeners, marker, 'title_changed', function () {
      var title = marker.getTitle();
      if (title) {
        placemark.setName(title);
      } else {
        placemark.setName('');
      }
    });

    addMVCFollower(listeners, marker, 'visible_changed', function () {
      if (marker.getVisible() === false) {
        placemark.setVisibility(false);
      } else {
        placemark.setVisibility(true);
      }
    });

    // TODO Follow other attributes of markers.

    doInsert(marker, placemark, listeners);
  };
  MapToEarth.prototype.makePathListener = function (placemark, latlngs,
                                                    coordinates) {
    var listeners = new google.maps.MVCArray();
    listeners.push(google.maps.event.addListener(latlngs,
                                                 'insert_at', function (i) {
      var x = latlngs.getAt(i);
      var l = coordinates.getLength();
      if (i < l / 2) {
        var head = [];
        for (var j = 0; j < i; j += 1) {
          head.push(coordinates.shift());
        }
        coordinates.unshiftLatLngAlt(x.lat(), x.lng(), 0);
        for (var j = 0; j < head.length; j += 1) {
          coordinates.unshift(head[j]);
        }
      } else {
        var tail = [];
        for (var j = i; j < l - 1; j += 1) {
          tail.push(coordinates.get(j));
        }
        coordinates.pushLatLngAlt(x.lat(), x.lng(), 0);
        for (var j = 0; j < tail.length; j += 1) {
          coordinates.push(tail[j]);
        }
      }
    }));
    listeners.push(google.maps.event.addListener(latlngs, 'remove_at', function (i, x) {
      var l = coordinates.getLength();
      if (i < l / 2) {
        var head = [];
        for (var j = 0; j < i; j += 1) {
          head.push(coordinates.shift());
        }
        coordinates.shift();
        for (var j = 0; j < head.length; j += 1) {
          coordinates.unshift(head[j]);
        }
      } else {
        for (var j = i; j < l - 2; j += 1) {
          coordinates.set(j, coordinates.get(j + 1));
        }
        coordinates.pop();
      }
    }));
    listeners.push(google.maps.event.addListener(latlngs, 'set_at', function (i, y) {
      var x = latlngs.getAt(i);
      coordinates.setLatLngAlt(i, x.lat(), x.lng(), 0);
    }));
    latlngs.forEach(function (x) {
      coordinates.pushLatLngAlt(x.lat(), x.lng(), 0);
    });
    return listeners;
  };
  MapToEarth.prototype.createPolyline = function (polyline, doInsert) {
    var self = this;
    var ge = this.get('earth_plugin');
    var placemark = ge.createPlacemark('');
    var linestring = ge.createLineString('');
    var latlngs = polyline.getPath();
    var coordinates = linestring.getCoordinates();
    linestring.setTessellate(true);

    var listeners = this.makePathListener(placemark, latlngs, coordinates);
    placemark.setGeometry(linestring);

    var line_style = ge.createStyle('');
    placemark.setStyleSelector(line_style);

    addMVCFollower(listeners, polyline, 'style_changed', function () {
      var pstyle = polyline.get('style');
      line_style.getLineStyle().setWidth(pstyle.strokeWeight || 2);
      line_style.getLineStyle().getColor().set(self.hexColorAndAlphaToEarthColor(
        pstyle.strokeColor || '000000', pstyle.strokeOpacity || 1));
    });

    doInsert(polyline, placemark, listeners);
  };
  MapToEarth.prototype.createPolygon = function (polygon, doInsert) {
    var self = this;
    var ge = this.get('earth_plugin');
    var placemark = ge.createPlacemark('');
    var poly = ge.createPolygon('');
    var outer = ge.createLinearRing('');
    poly.setOuterBoundary(outer);
    var latlngs = polygon.getPath();
    var coordinates = outer.getCoordinates();
    var listeners = this.makePathListener(placemark, latlngs, coordinates);
    placemark.setGeometry(poly);

    var poly_style = ge.createStyle('');
    placemark.setStyleSelector(poly_style);

    addMVCFollower(listeners, polygon, 'style_changed', function () {
      var pstyle = polygon.get('style');
      poly_style.getLineStyle().getColor().set(self.hexColorAndAlphaToEarthColor(
        pstyle.strokeColor || '000000', pstyle.strokeOpacity || 1));
      poly_style.getPolyStyle().getColor().set(self.hexColorAndAlphaToEarthColor(
        pstyle.fillColor || '000000', pstyle.fillOpacity || 0.5));
    });

    doInsert(polygon, placemark, listeners);
  };
  MapToEarth.prototype.createKmlLayer = function (kmllayer, doInsert) {
    var ge = this.get('earth_plugin');
    if (!kmllayer.kmlobj) {
      google.earth.fetchKml(ge, kmllayer.url, function (kmlobj) {
        if (kmlobj) {
          kmllayer.kmlobj = kmlobj;
          doInsert(kmllayer, kmllayer.kmlobj);
        }
      });
    } else {
      doInsert(kmllayer, kmllayer.kmlobj);
    }
  };
  MapToEarth.prototype.createCircle = function (circle, doInsert) {
    var self = this;
    var ge = this.get('earth_plugin');
    var listeners = new google.maps.MVCArray();

    var polyc = ge.createPlacemark('');
    polyc.setGeometry(ge.createPolygon(''));

    function centerOrRadiusChanged() {
      var center = circle.getCenter();
      polyc.getGeometry().setOuterBoundary(self.makeCircleLinearRing(
        ge, center.lat(), center.lng(), circle.getRadius() / Math.pow(10, 5)));
    }
    addMVCFollower(listeners, circle, 'center_changed', centerOrRadiusChanged);
    addMVCFollower(listeners, circle, 'radius_changed', centerOrRadiusChanged);
    centerOrRadiusChanged();

    var style = ge.createStyle('');
    polyc.setStyleSelector(style);

    function styleChanged() {
      style.getLineStyle().getColor().set(self.hexColorAndAlphaToEarthColor(
        circle.get('strokeColor') || '000000', circle.get('strokeOpacity') || 1));
      style.getLineStyle().setWidth(circle.get('strokeWeight') || 2);
      style.getPolyStyle().getColor().set(self.hexColorAndAlphaToEarthColor(
        circle.get('fillColor') || '000000', circle.get('fillOpacity') || 0.5));
    };
    addMVCFollower(listeners, circle, 'fillcolor_changed', styleChanged);
    addMVCFollower(listeners, circle, 'fillopacity_changed', styleChanged);
    addMVCFollower(listeners, circle, 'strokecolor_changed', styleChanged);
    addMVCFollower(listeners, circle, 'strokeopacity_changed', styleChanged);
    addMVCFollower(listeners, circle, 'strokeweight_changed', styleChanged);

    doInsert(circle, polyc);
  };
  MapToEarth.prototype.createRectangle = function (rect, doInsert) {
    var self = this;
    var ge = this.get('earth_plugin');
    var listeners = new google.maps.MVCArray();

    var polyr = ge.createPlacemark('');
    polyr.setGeometry(ge.createPolygon(''));
    var rectRing = ge.createLinearRing('');
    var coords = rectRing.getCoordinates();
    polyr.getGeometry().setOuterBoundary(rectRing);

    addMVCFollower(listeners, rect, 'bounds_changed', function () {
      var bounds = rect.getBounds();
      var sw = bounds.getSouthWest();
      var ne = bounds.getNorthEast();

      coords.clear();
      coords.pushLatLngAlt(sw.lat(), sw.lng(), 0);
      coords.pushLatLngAlt(ne.lat(), sw.lng(), 0);
      coords.pushLatLngAlt(ne.lat(), ne.lng(), 0);
      coords.pushLatLngAlt(sw.lat(), ne.lng(), 0);
      coords.pushLatLngAlt(sw.lat(), sw.lng(), 0);
    });

    var style = ge.createStyle('');
    polyr.setStyleSelector(style);
    function styleChanged() {
      style.getLineStyle().getColor().set(self.hexColorAndAlphaToEarthColor(
        rect.get('strokeColor') || '000000', rect.get('strokeOpacity') || 1));
      style.getLineStyle().setWidth(rect.get('strokeWeight') || 2);
      style.getPolyStyle().getColor().set(self.hexColorAndAlphaToEarthColor(
        rect.get('fillColor') || '000000', rect.get('fillOpacity') || 0.5));
    };
    addMVCFollower(listeners, rect, 'fillcolor_changed', styleChanged);
    addMVCFollower(listeners, rect, 'fillopacity_changed', styleChanged);
    addMVCFollower(listeners, rect, 'strokecolor_changed', styleChanged);
    addMVCFollower(listeners, rect, 'strokeopacity_changed', styleChanged);
    addMVCFollower(listeners, rect, 'strokeweight_changed', styleChanged);

    doInsert(rect, polyr);
  };

  function EarthMapType(map) {
    this.setMap(map);
  }
  EarthMapType.prototype = new google.maps.OverlayView();

  // Pretend to be MapType
  EarthMapType.prototype.tileSize = new google.maps.Size(10000, 10000);
  EarthMapType.prototype.maxZoom = 19;
  EarthMapType.prototype.name = 'Earth';
  EarthMapType.prototype.alt = 'Show 3D earth';
  EarthMapType.prototype.getTile = function (coord, zoom, ownerDocument) {
    return ownerDocument.createElement('DIV');
  };

  EarthMapType.prototype._withEarth = function (fn) {
    // Retry every 50ms for ~10s.
    var retry = 200,
        retryDelay = 50,
        self = this;
    (function () {
      var earth = self.get('earth_plugin');
      if (!earth && retry > 0) {
        retry -= 1;
        return setTimeout(arguments.callee, retryDelay);
      }
      if (retry <= 0) {
        LOG(['ERROR: No earth plugin object was found in a ',
               'reasonable time frame.'].join(''));
        return;
      }
      fn(earth);
    })();
  };
  EarthMapType.prototype._initEarth = function (ge) {
    var self = this;
    this.set('earth_plugin', ge);
    this.mapper = new MapToEarth(this);
    ge.getWindow().setVisibility(true);
    this.get('container_earth').childNodes[0].style.zIndex = 1001;
    this.get('container_earth').style.visibility = 'hidden';
    
    // Attempt to prevent plugin from locking up focus.
    google.earth.addEventListener(ge.getWindow(), 'mouseout', function () {
      // TODO Mac OS X blur doesn't work
      ge.getWindow().blur();
    });

    // Unify certain options for map and earth
    google.maps.event.addListener(this, 'atmosphere_changed', function () {
      if (self.get('atmosphere')) {
        ge.getOptions().setAtmosphereVisibility(true);
      } else {
        ge.getOptions().setAtmosphereVisibility(false);
      }
    });
    google.maps.event.addListener(this, 'graticules_changed', function () {
      if (self.get('graticules')) {
        ge.getOptions().setGridVisibility(true);
        if (self.get('overlay_graticules')) {
          self.get('overlay_graticules').show();
          self.get('overlay_graticules').draw();
        }
      } else {
        ge.getOptions().setGridVisibility(false);
        if (self.get('overlay_graticules')) {
          self.get('overlay_graticules').hide();
        }
      }
    });

    // Duplicate earth mouse events on map
    var win = ge.getWindow();
    var mousedown = false;
    function kmlme_to_me(kme) {
      return {latLng: new google.maps.LatLng(kme.getLatitude(), kme.getLongitude())};
    }
    function passAlong(earthEvent, mapEvent) {
      google.earth.addEventListener(win, earthEvent, function (kmlmouseevent) {
        if (kmlmouseevent.getDidHitGlobe()) {
          google.maps.event.trigger(map, mapEvent ? mapEvent : earthEvent,
                                    kmlme_to_me(kmlmouseevent));
        }
      });
    }
    passAlong('click');
    passAlong('dblclick', 'doubleclick');
    passAlong('mouseover');
    google.earth.addEventListener(win, 'mousedown', function (kmlmouseevent) {
      mousedown = true;
      if (kmlmouseevent.getDidHitGlobe()) {
        google.maps.event.trigger(map, 'mousedown', kmlme_to_me(kmlmouseevent));
      }
    });
    google.earth.addEventListener(win, 'mouseup', function (kmlmouseevent) {
      mousedown = false;
      google.maps.event.trigger(map, 'mouseup', kmlme_to_me(kmlmouseevent));
    });
    passAlong('mouseout');
    google.earth.addEventListener(win, 'mousemove', function (kmlmouseevent) {
      if (kmlmouseevent.getDidHitGlobe()) {
        google.maps.event.trigger(map, 'mousemove', kmlme_to_me(kmlmouseevent));
        if (mousedown) {
          google.maps.event.trigger(map, 'drag');
        }
      }
    });
    this.jumpToCenter(ge);
    google.maps.event.trigger(this, 'initialized');
  };
  EarthMapType.prototype.getDiv = function () {
    var map = this._map || this.get('map');
    return map.getDiv().childNodes[0];
  };
  EarthMapType.prototype.onAdd = function () {
    var self = this;
    var map = this.getMap();
    this._map = map;

    this.set('linker', new Linker());

    map.mapTypes.set(this.name, this);

    map[this.get('linker').name] = this.get('linker');
    this[this.get('linker').name] = this.get('linker');

    this.set('maptypeid_listener',
             google.maps.event.addListener(map, 'maptypeid_changed',
                                           function () {
      if (map.getMapTypeId() == self.name) {
        self.show();
      } else {
        self.set('previousMapTypeId', map.getMapTypeId());
        self.get('showing') && self.hide();
      }
    }));

    // Set up graticules if defined
    if (window.Graticule) {
      this.set('overlay_graticules', new Graticule(map));
      this.get('overlay_graticules').hide();
    }

    var earthDiv = document.createElement('DIV');
    earthDiv.id = 'CONTAINER_EARTH';
    earthDiv.style.width = "100%";
    earthDiv.style.height = "100%";
    this.getDiv().appendChild(earthDiv);
    this.set('container_earth', earthDiv);

    // iframe shim for map menu type
    var shim = makeIframeShim();
    shim.style.zIndex = 1000;
    this.set('shim', shim);

    if (google.earth) {
      google.earth.createInstance(earthDiv, function (ge) {
        self._initEarth(ge);
      }, function (errorCode) {
        LOG('Unable to initialize Google Earth plugin:', errorCode);
      });
    } else {
      LOG('Why did you include this library?');
    }
  };
  EarthMapType.prototype.onRemove = function () {
    this._map.mapTypes.set(this.name, null);
    google.maps.event.removeListener(this.get('maptypeid_listener'));
    this.getDiv().removeChild(this.get('container_earth'));
    this._map = null;
    this.get('shim').parentNode.removeChild(this.get('shim'));
  };
  EarthMapType.prototype.draw = function () {
  };
  EarthMapType.prototype._flyToAtSpeed = function (ge, lookat, speed) {
    var flyToSpeed = ge.getOptions().getFlyToSpeed();
    ge.getOptions().setFlyToSpeed(speed ? speed : ge.SPEED_TELEPORT);
    ge.getView().setAbstractView(lookat);
    ge.getOptions().setFlyToSpeed(flyToSpeed);
  };
  EarthMapType.prototype.show = function () {
    var ge = this.get('earth_plugin');
    var map = this.get('map');

    if (!ge) {
      return;
    }

    var shim = this.get('shim');
    // XXX HACK attempt to find the map panes
    var possible = this.get('map').getDiv().firstChild.children;
    var shimmed = null;
    // XXX HACK attempt to find the div for the map menu.
    for (var i = 0; i < possible.length; i += 1) {
      var e = possible[i];
      if (e.className.indexOf('gmnoprint') > -1) {
        var children = e.children;
        var found = false;
        for (var j = 0; j < children.length; j += 1) {
          if (children[j].title.indexOf('Change map style') > -1) {
            found = true;
            break;
          }
        }
        if (found) {
          shimmed = e;
          break;
        }
      }
    }
    if (shimmed) {
      shimmed.onmousedown = function () {
        setIframeShim(shim, shimmed);
      };
      shimmed.onmousemove = function () {
        var menu_timeout = 1500;
        setTimeout(shimmed.onmousedown, menu_timeout);
      }
      setIframeShim(shim, shimmed);
      shimmed.style.zIndex = Number(shim.style.zIndex) + 1;
    }

    // Save and translate map state
    var map_state = {};

    // Prevent scrolling on map so plugin gets scrolling events
    map_state.scrollwheel = map.get('scrollwheel');
    map.set('scrollwheel', false);

    if (map.get('zoomControl') != false) {
      var maps_earth_zoom_control_style = {};
      maps_earth_zoom_control_style[google.maps.ZoomControlStyle.LARGE] = 
        ge.NAVIGATION_CONTROL_LARGE;
      maps_earth_zoom_control_style[google.maps.ZoomControlStyle.SMALL] = 
        ge.NAVIGATION_CONTROL_SMALL;
      ge.getNavigationControl().setVisibility(ge.VISIBILITY_AUTO);
      ge.getNavigationControl().setStreetViewEnabled(
        map.get('streetViewControl') || map.get('streetViewControl') == null);
      var screenxy = ge.getNavigationControl().getScreenXY();
      screenxy.setXUnits(ge.UNITS_PIXELS);
      ge.getNavigationControl().setControlType(
        maps_earth_zoom_control_style[google.maps.ZoomControlStyle.LARGE]);
      // TODO figure out some way to get Maps default settings without hard
      // coding. This doesn't work.
      if (map.get('zoomControl') == true) {
        var opts = map.get('zoomControlOptions');
        if (opts) {
          ge.getNavigationControl().setControlType(
            maps_earth_zoom_control_style[opts.style]);
          // TODO also set position
        }
      }
    }

    if (this.get('previousMapTypeId') == google.maps.MapTypeId.HYBRID ||
        this.get('previousMapTypeId') == google.maps.MapTypeId.ROADMAP ||
        this.get('previousMapTypeId') == google.maps.MapTypeId.TERRAIN) {
      ge.getLayerRoot().enableLayerById(ge.LAYER_ROADS, true);
      ge.getLayerRoot().enableLayerById(ge.LAYER_BORDERS, true);
    } else {
      ge.getLayerRoot().enableLayerById(ge.LAYER_ROADS, false);
      ge.getLayerRoot().enableLayerById(ge.LAYER_BORDERS, false);
    }

    this.jumpToCenter(ge);
    this.get('container_earth').style.visibility = 'inherit';

    this.set('map_state', map_state);
    this.set('showing', true);
  };
  EarthMapType.prototype.jumpToCenter = function (ge) {
    var center = this.get('map').getCenter();
    var lookat = ge.createLookAt('');
    lookat.set(center.lat(), center.lng(), 0, ge.ALTITUDE_CLAMP_TO_GROUND,
               0, 0, this.mapper.zoomToRange(this.get('map').getZoom()));
    this._flyToAtSpeed(ge, lookat);
  };
  EarthMapType.prototype.hide = function () {
    var ge = this.get('earth_plugin');

    if (!ge) {
      return;
    }

    if (this.get('shim')) {
      this.get('shim').style.visibility = 'hidden';
    }
    var lookat = ge.getView().copyAsLookAt(ge.ALTITUDE_CLAMP_TO_GROUND);
    var zoom = this.mapper.rangeToZoom(lookat.getRange());
    var range = this.mapper.zoomToRange(zoom);

    var map = this.get('map');
    map.setZoom(zoom);
    map.setCenter(new google.maps.LatLng(
      lookat.getLatitude(), lookat.getLongitude()));

    var transition = false;
    var self = this;

    function afterTransition() {
      var map_state = self.get('map_state');
      map.set('scrollwheel', map_state.scrollwheel);
      if (transition) {
        google.earth.removeEventListener(
          ge.getView(), 'viewchangeend', arguments.callee);
      }
      self.get('container_earth').style.visibility = 'hidden';
      self.set('showing', false);
    }

    if (lookat.getHeading() != 0 || lookat.getTilt() != 0 ||
        range != lookat.getRange()) {
      lookat.setRange(range);
      lookat.setHeading(0);
      lookat.setTilt(0);
      transition = true;
      google.earth.addEventListener(
        ge.getView(), 'viewchangeend', afterTransition);
      this._flyToAtSpeed(ge, lookat, 4.5);
    } else {
      afterTransition();
    }
  };

  return EarthMapType;
})();
