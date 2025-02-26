/* eslint-disable no-multi-assign, no-nested-ternary */
L.HeatMap = (L.Layer ? L.Layer : L.Class).extend({

  // options: {
  //     minOpacity: 0.05,
  //     maxZoom: 18,
  //     radius: 25,
  //     blur: 15,
  // },

  /**
     *
     * @param {Array<[number, number]>} latlngs
     * @param {{ minOpacity?: number, radius?: number, blur?: number } | Object<string, any>} options
     */
  initialize: function(latlngs, options) {
    this._latlngs = latlngs;
    L.setOptions(this, options);
  },

  /**
     *
     * @param {Array<[number, number]>} latlngs
     * @returns {() => void}
     */
  setLatLngs: function(latlngs) {
    this._latlngs = latlngs;
    return this.redraw();
  },

  addLatLng: function(latlng) {
    this._latlngs.push(latlng);
    return this.redraw();
  },

  setOptions: function(options) {
    L.setOptions(this, options);
    if (this._heat) {
      this._updateOptions();
    }
    return this.redraw();
  },

  redraw: function() {
    if (this._heat && !this._frame && this._map && !this._map._animating) {
      this._frame = L.Util.requestAnimFrame(this._redraw, this);
    }
    return this;
  },

  onAdd: function(map) {
    this._map = map;

    if (!this._canvas) {
      this._initCanvas();
    }

    if (this.options.pane) {
      this.getPane().appendChild(this._canvas);
    } else {
      map._panes.overlayPane.appendChild(this._canvas);
    }

    map.on('moveend', this._reset, this);

    if (map.options.zoomAnimation && L.Browser.any3d) {
      map.on('zoomanim', this._animateZoom, this);
    }

    this._reset();
  },

  onRemove: function(map) {
    if (this.options.pane) {
      this.getPane().removeChild(this._canvas);
    } else {
      map.getPanes().overlayPane.removeChild(this._canvas);
    }

    map.off('moveend', this._reset, this);

    if (map.options.zoomAnimation) {
      map.off('zoomanim', this._animateZoom, this);
    }
  },

  addTo: function(map) {
    map.addLayer(this);
    return this;
  },

  _initCanvas: function() {
    const canvas = this._canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-layer leaflet-layer');

    const originProp = L.DomUtil.testProp(['transformOrigin', 'WebkitTransformOrigin', 'msTransformOrigin']);
    canvas.style[originProp] = '50% 50%';

    const size = this._map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;

    const animated = this._map.options.zoomAnimation && L.Browser.any3d;
    L.DomUtil.addClass(canvas, `leaflet-zoom-${animated ? 'animated' : 'hide'}`);

    this._heat = simpleheat(canvas);
    this._updateOptions();
  },

  _updateOptions: function() {
    this._heat.radius(this.options.radius || this._heat.defaultRadius, this.options.blur);

    if (this.options.gradient) {
      this._heat.gradient(this.options.gradient);
    }
    // Removed per -> https://github.com/Leaflet/Leaflet.heat/pull/78/
    // if (this.options.max) {
    //     this._heat.max(this.options.max);
    // }
  },

  _reset: function() {
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);

    const size = this._map.getSize();

    if (this._heat._width !== size.x) {
      this._canvas.width = this._heat._width = size.x;
    }
    if (this._heat._height !== size.y) {
      this._canvas.height = this._heat._height = size.y;
    }

    this._redraw();
  },

  _redraw: function() {
    if (!this._map) return;

    const data = [];
    const r = this._heat._r;
    const size = this._map.getSize();
    const bounds = new L.Bounds(
      L.point([-r, -r]),
      size.add([r, r]),
    );

    // Removed per max = https://github.com/Leaflet/Leaflet.heat/pull/78/
    // max = this.options.max === undefined ? 1 : this.options.max,
    // maxZoom = this.options.maxZoom === undefined ? this._map.getMaxZoom() : this.options.maxZoom,
    // v = 1,
    const cellSize = r / 2;
    const grid = [];
    const panePos = this._map._getMapPanePos();
    const offsetX = panePos.x % cellSize;
    const offsetY = panePos.y % cellSize;
    let i, len, p, cell, x, y, j, len2;

    this._max = 1;

    // console.time('process');
    for (i = 0, len = this._latlngs.length; i < len; i++) {
      // Add Ability to Add Custom Lat, Lang, and Value fields -> https://github.com/Leaflet/Leaflet.heat/pull/66/
      let point = this._latlngs[i];

      // use options to get lat and lng fields
      if (this.options.latField !== undefined && this.options.lngField !== undefined) {
        if (this.options.valueField !== undefined) {
          point = new L.LatLng(point[this.options.latField], point[this.options.lngField], point[this.options.valueField]);
        } else {
          point = new L.LatLng(point[this.options.latField], point[this.options.lngField]);
        }
      }

      p = this._map.latLngToContainerPoint(point);
      x = Math.floor((p.x - offsetX) / cellSize) + 2;
      y = Math.floor((p.y - offsetY) / cellSize) + 2;
      // https://github.com/Leaflet/Leaflet.heat/pull/66/
      const alt = (point[i].alt !== undefined)
        ? point[i].alt
        : (point[i][2] !== undefined)
          ? +point[i][2]
          : 1;

      // Fix NaN per: https://github.com/Leaflet/Leaflet.heat/pull/60/
      // if (isNaN(alt) || alt == 0) alt = 1;
      // k = Math.abs(alt) * v;

      grid[y] = grid[y] || [];
      cell = grid[y][x];

      if (!cell) {
        cell = grid[y][x] = [p.x, p.y, alt];
        cell.p = p;
      } else {
        cell[0] = (cell[0] * cell[2] + p.x * alt) / (cell[2] + alt); // x
        cell[1] = (cell[1] * cell[2] + p.y * alt) / (cell[2] + alt); // y
        cell[2] += alt; // cumulated intensity value
      }

      // Set the max for the current zoom level
      if (cell[2] > this._max) { this._max = cell[2]; }

      // if (bounds.contains(p)) {
      //     x = Math.floor((p.x - offsetX) / cellSize) + 2;
      //     y = Math.floor((p.y - offsetY) / cellSize) + 2;

      //     if (!cell) {
      //         grid[y][x] = [p.x, p.y, k];

      //     } else {
      //         cell[0] = (cell[0] * cell[2] + p.x * k) / (cell[2] + k); // x
      //         cell[1] = (cell[1] * cell[2] + p.y * k) / (cell[2] + k); // y
      //         // Fix Per: https://github.com/Leaflet/Leaflet.heat/pull/32/
      //         cell[2] = (cell[2] * (1 - k / max)) + k; // Join multiple cell values using alpha blending
      //     }
      // }
    }

    this._heat.max(this._max);

    for (i = 0, len = grid.length; i < len; i++) {
      if (grid[i]) {
        for (j = 0, len2 = grid[i].length; j < len2; j++) {
          cell = grid[i][j];
          if (cell && bounds.contains(cell.p)) {
            data.push([
              Math.round(cell[0]),
              Math.round(cell[1]),
              Math.min(cell[2], this._max),
            ]);
          }
        }
      }
    }
    // console.timeEnd('process');

    // console.time('draw ' + data.length);
    this._heat.data(data).draw(this.options.minOpacity);
    // console.timeEnd('draw ' + data.length);

    this._frame = null;
  },

  _animateZoom: function(e) {
    const scale = this._map.getZoomScale(e.zoom),
      offset = this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());

    if (L.DomUtil.setTransform) {
      L.DomUtil.setTransform(this._canvas, offset, scale);
    } else {
      this._canvas.style[L.DomUtil.TRANSFORM] = `${L.DomUtil.getTranslateString(offset)} scale(${scale})`;
    }
  },
});

L.heatMap = function(latlngs, options) {
  return new L.HeatMap(latlngs, options);
};
