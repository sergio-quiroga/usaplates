/**
 * Renders the US states map (pre-projected Albers topojson from us-atlas)
 * with pan/zoom and exposes hooks for coloring states and handling clicks.
 */
(function () {
  "use strict";

  const config = window.USAPLATES;
  let pathsByCode = new Map();
  let onStateClick = null;

  function init(options) {
    onStateClick = options.onStateClick;

    return d3.json(config.statesTopoUrl).then((topology) => {
      const fipsToCode = JSON.parse(document.getElementById("fips-to-code").textContent);
      const geo = topojson.feature(topology, topology.objects.states);

      const pathGen = d3.geoPath();
      const [[x0, y0], [x1, y1]] = pathGen.bounds(geo);
      const width = Math.ceil(x1);
      const height = Math.ceil(y1);

      const container = d3.select("#map");
      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Mapa de Estados Unidos");

      const zoomLayer = svg.append("g").attr("class", "zoom-layer");
      const statesGroup = zoomLayer.append("g").attr("class", "states");
      const labelsGroup = zoomLayer.append("g").attr("class", "labels");

      statesGroup
        .selectAll("path")
        .data(geo.features)
        .join("path")
        .attr("class", "state-shape")
        .attr("d", pathGen)
        .attr("data-code", (d) => fipsToCode[d.id] || "")
        .on("click", (event, d) => {
          const code = fipsToCode[d.id];
          if (code && onStateClick) onStateClick(code);
        })
        .each(function (d) {
          const code = fipsToCode[d.id];
          if (code) pathsByCode.set(code, this);
        });

      labelsGroup
        .selectAll("text")
        .data(geo.features)
        .join("text")
        .attr("class", "state-label")
        .attr("transform", (d) => `translate(${pathGen.centroid(d)})`)
        .text((d) => d.properties.name);

      const zoom = d3
        .zoom()
        .scaleExtent([1, 8])
        .translateExtent([[0, 0], [width, height]])
        .on("zoom", (event) => {
          zoomLayer.attr("transform", event.transform);
        });

      svg.call(zoom);
    });
  }

  function updateStatuses(statusByCode) {
    pathsByCode.forEach((node, code) => {
      const status = statusByCode[code] || "none";
      node.classList.remove("status-him", "status-her", "status-both");
      if (status !== "none") {
        node.classList.add("status-" + status);
      }
    });
  }

  window.USAPLATESMap = { init, updateStatuses };
})();
