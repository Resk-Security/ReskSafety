import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  label: string;
  group: string;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
}

const GROUP_ORDER = ["user", "session", "tool", "provider", "role", "policy", "capability"];

const COLORS: Record<string, string> = {
  user: "hsl(221, 83%, 53%)",
  session: "hsl(142, 71%, 45%)",
  tool: "hsl(30, 100%, 50%)",
  provider: "hsl(271, 81%, 56%)",
  role: "hsl(190, 90%, 50%)",
  policy: "hsl(350, 80%, 60%)",
  capability: "hsl(160, 80%, 45%)",
};

const GROUP_R: Record<string, number> = {
  user: 14, session: 10, tool: 9, provider: 10,
  role: 11, policy: 10, capability: 8,
};

const GROUP_LABELS: Record<string, string> = {
  user: "User", session: "Session", tool: "Tool",
  provider: "Provider", role: "Role", policy: "Policy", capability: "Capability",
};

const HIGHLIGHT_COLOR = "hsl(45, 100%, 60%)";

export function ForceGraph({ nodes, links }: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const groups = [...new Set(nodes.map((n) => n.group))].sort(
    (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
  );
  const visibleNodes = nodes.filter((n) => !hiddenGroups.has(n.group));
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleLinks = links.filter((l) => visibleNodeIds.has(l.source) && visibleNodeIds.has(l.target));

  const selectedNode = selectedId ? visibleNodes.find((n) => n.id === selectedId) ?? null : null;
  const neighborIds = selectedNode
    ? new Set([
        selectedNode.id,
        ...visibleLinks
          .filter((l) => l.source === selectedNode.id || l.target === selectedNode.id)
          .flatMap((l) => [l.source, l.target]),
      ])
    : null;

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 600;
    const height = 500;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const defs = svg.append("defs");
    if (visibleLinks.length > 0) {
      defs.append("marker")
        .attr("id", "arrowhead")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "hsl(var(--border))");
    }

    const g = svg.append("g");

    svg.on("click", (event: any) => {
      if (event.target.tagName === "svg") setSelectedId(null);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
    svg.call(zoom);

    const simLinks = visibleLinks.map((l) => ({ ...l }));

    const groupKeys = [...new Set(visibleNodes.map((n) => n.group))];
    const yPositions: Record<string, number> = {};
    const spacing = height / (groupKeys.length + 1);
    groupKeys.forEach((g, i) => { yPositions[g] = spacing * (i + 1); });

    const simulation = d3.forceSimulation(visibleNodes as any)
      .force("link", d3.forceLink(simLinks as any).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(25))
      .force("y", d3.forceY((d: any) => yPositions[d.group] || height / 2).strength(0.4));

    const link = g.append("g")
      .selectAll<SVGLineElement, any>("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", (d: any) => {
        if (!neighborIds) return "hsl(var(--border))";
        return neighborIds.has(d.source.id) && neighborIds.has(d.target.id)
          ? "hsl(var(--foreground))"
          : "hsl(var(--border))";
      })
      .attr("stroke-width", (d: any) => {
        if (!neighborIds) return 1.5;
        return neighborIds.has(d.source.id) && neighborIds.has(d.target.id) ? 2.5 : 0.5;
      })
      .attr("stroke-dasharray", (d: any) => d.type === "routed_to" ? "4 2" : "none")
      .attr("marker-end", "url(#arrowhead)");

    const node = g.append("g")
      .selectAll<SVGGElement, any>("g")
      .data(visibleNodes)
      .join("g")
      .style("cursor", "pointer")
      .on("click", (_event: any, d: any) => {
        setSelectedId(d.id);
        _event.stopPropagation();
      })
      .call(d3.drag<any, any>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    node.append("circle")
      .attr("r", (d: any) => {
        const base = GROUP_R[d.group as string] || 8;
        return selectedId === d.id ? base * 1.5 : base;
      })
      .attr("fill", (d: any) => COLORS[d.group] || "hsl(var(--muted-foreground))")
      .attr("stroke", (d: any) =>
        selectedId === d.id ? HIGHLIGHT_COLOR : "hsl(var(--background))"
      )
      .attr("stroke-width", (d: any) =>
        selectedId === d.id ? 4 : 2
      );

    node.append("text")
      .text((d: any) => d.label)
      .attr("dy", (d: any) => (GROUP_R[d.group] || 8) + 14)
      .attr("text-anchor", "middle")
      .attr("fill", (d: any) =>
        neighborIds && !neighborIds.has(d.id)
          ? "hsl(var(--muted-foreground) / 0.3)"
          : "hsl(var(--foreground))"
      )
      .attr("font-size", "10px");

    node.append("title")
      .text((d: any) => `${d.label} (${d.group})`);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight || 400;
      svg.attr("width", w).attr("height", h);
      simulation.force("center", d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      simulation.stop();
    };
  }, [nodes, links, hiddenGroups, selectedId, neighborIds]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3 text-xs">
        {groups.map((g) => (
          <label key={g} className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!hiddenGroups.has(g)}
              onChange={() => {
                setHiddenGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(g)) next.delete(g); else next.add(g);
                  return next;
                });
              }}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[g] || "hsl(var(--muted-foreground))" }}
            />
            {GROUP_LABELS[g] || g}
          </label>
        ))}
      </div>
      <div ref={containerRef} className="w-full" style={{ minHeight: 400 }}>
        <svg ref={svgRef} className="w-full" />
      </div>
      {selectedNode && (
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: COLORS[selectedNode.group] }}
          />
          Selected: <strong>{selectedNode.label}</strong>
          <span className="text-[10px]">({selectedNode.group})</span>
          <button
            className="underline hover:text-foreground"
            onClick={() => setSelectedId(null)}
          >
            clear
          </button>
        </div>
      )}
    </div>
  );
}

export function GraphLegend() {
  const items = [
    { label: "User", group: "user" },
    { label: "Session", group: "session" },
    { label: "Tool", group: "tool" },
    { label: "Provider", group: "provider" },
    { label: "Role", group: "role" },
    { label: "Policy", group: "policy" },
    { label: "Capability", group: "capability" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.group} className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: COLORS[i.group] }}
          />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1">
        <span className="inline-block h-0 w-3 border-t border-dashed" /> routed
      </span>
    </div>
  );
}