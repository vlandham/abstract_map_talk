var width=960,height=800;
var debugE;
var svgMap=d3.select("#chart")
	.append("svg")
	.attr("width",width)
	.attr("height",height);
var myScale=1;
var dist,avg;
var timeScale=d3.scale.linear().domain([1000,1500,2500]).range(["white","yellow","red"]);
var traScale=d3.scale.sqrt().domain([0,50000000]).range([0,15]);
var edgeScale=d3.scale.linear().domain([0,.01]).clamp([true]).range([1,5]);
var projection=d3.geo.mercator()
	.translate([524	,450])
	.center([2.348785,48.853402])
	.scale(1100000)
var geoCheck=false;

var ratpColors={"Acacia":"#CDC83F","Azur":"#216EB4","Bouton d'Or":"#F2C931","Cobalt":"#4E90CC","Coquelicot":"#D35E3C","Iris":"#67328E","Lilas":"#C5A3CA","Marron":"#8E6538","Menthe":"#79BB92","Ocre":"#DFB039","Olive":"#9A9940","Orange":"#DE8A53","Parme":"#BB4D98","Pervenche":"#89C7D6","Rose":"#DF9AB1","Sapin":"#328E5B","gris":"#222"};
var lineColors={1:"Bouton d'Or",2:"Azur",3:"Olive","3bis":"Pervenche",4:"Parme",5:"Orange",6:"Menthe",7:"Rose","7bis":"Menthe",8:"Lilas",9:"Acacia",10:"Ocre",11:"Marron",12:"Sapin",13:"Pervenche",14:"Iris","marche":"gris"}

var colors={};d3.keys(lineColors).forEach(function(l) {colors[l]=ratpColors[lineColors[l]];})

var defs=svgMap.append("defs");

svgMap.append("rect").style("fill","#fafafa").style("stroke","none").attr("width",width).attr("height",height).attr("class","bkgd")


var backCircles=svgMap.append("g");
var cellSta = svgMap.append("g").attr({width:width,height:height})
    .attr("id", "Sta")

var staCircleLayer=svgMap.append("g").attr("id","staCircleLayer")
var legend=svgMap.append("g");
var frame=svgMap.append("g");
frame.append("rect").attr({width:width,height:height}).style({fill:"none",stroke:"#bbb"});
frame.append("rect").attr({width:width-2,height:height-2,x:1,y:1}).style({fill:"none",stroke:"white"});


var selected=-1;
var data,stations,edges,nodes,edgeArr,votes;

queue()
	.defer(d3.json, "readvotes.json")
    .defer(d3.csv, "stations.csv")
    .defer(d3.csv, "edges.csv")
    .defer(d3.csv, "nodes.csv")
    .await(ready);
// reading data for polling station

function ready(error, v,s,e,n) {
	d3.select(".bkgd").on("click",function() {
		//console.log("clicked on background")
		repos(n,e,s);});
	d3.select("#geo").on("change",function() {
		geoCheck=!geoCheck;
		reinit(geoCheck,n,e,s)
	})
	
	v=v.values.map(function(d) {return d.value;})
	v=d3.nest().key(function(d) {return d.edge}).rollup(function(d) {var record=d[0];record.edges=[];return record}).map(v);

	s.forEach(function(d) {
		//pos2.push(projection([+s.lon,+s.lat]));
		var geo=projection([+d.lon,+d.lat]);
		d.projx=d3.scale.linear().domain([0,7500]).range([0,800])(d.ratpx);
		d.projy=d3.scale.linear().domain([0,7500]).range([0,800])(d.ratpy);
		d.ratpx=d.projx;d.ratpy=d.projy;
		d.geox=geo[0],d.geoy=geo[1];
		
		d.ox=d.projx,d.oy=d.projy;
	})
	
	var totalT=d3.sum(s,function(d) {return d.trafic;})

	edgesStart=d3.nest().key(function(d) {return d.start;}).map(e);
	computeDistance(s,e); // factoting walking distance
	e.forEach(function(e,i) {
		e.id=i;
		e.reverse=+e.reverse;
		e.active=true;
		e.start=+e.start;
		e.end=+e.end;
		if (e.edgeVote) {
			e.length=+(v[e.edgeVote].value)*3; // value is between 0 and 100 and corresponds to times between 0 and 5 minutes. 
			if (e.type!=="exit") {e.length=e.length+120;} // when entering a station or switching lines you have to wait for a train, so 2 minutes are added on average.
			v[e.edgeVote].edges.push(e.id);
		} else {
			e.length=+e.length;
		}
		e.s1=n[e.start].station;
		e.s2=n[e.end].station;
		var t1=+s[e.s1].trafic/edgesStart[s[e.s1].main].length;
		var t2=+s[e.s2].trafic/edgesStart[s[e.s2].main].length;
		//console.log(s[e.s1].main,edgesStart[s[e.s1].main].length)
		e.share=(t1+t2)/totalT;
		if (e.type==="marche") {e.share=0.001}
	})

	reticulate(e,s);

	stations=s;	
	nodes=n;	
	edges=e;
	votes=v;

	edgesStart=d3.nest().key(function(d) {return d.start;}).map(e);
	edgesEnd=d3.nest().key(function(d) {return d.end;}).map(e);

	edgesC=e.filter(function(d) {if(["entrance","exit","correspondance"].indexOf(d.type)===-1) {
		d.color=ratpColors[lineColors[d.type]];return true}})
	
	dist=calcDist(n,edgesStart,s);

	var g3 = staCircleLayer.selectAll("circle").data(stations).enter()
	
	g3
		.append("circle").attr("class","staCircles")
		.style({fill:function(d,i) {return timeScale(dist[i].avg);},stroke:"black"})
		.attr("cx", function(d, i) { return d.projx; })
		.attr("cy", function(d, i) { return d.projy; })
		.attr("r",function(d,i) {return d.corr*2+3;/*traScale(stations[i].trafic)*/} )
		.append("title").text(function(d) {return d.name;});
	g3.append("text").attr("class","staLabels")
		.style({visibility:"hidden"})
		.attr({x:function(d) {return d.projx+5;},y:function(d) {return d.projy-5;},id:function(d,i) {return "l"+i;}})
		.text(function(d) {return d.name;})

	d3.selectAll(".staCircles")
		.on("click",function(d) {
			console.log("clicked on a station")
			repos(n,e,s,v,d,dist);
		})
		
	cellSta.selectAll("path")
		.data(edgesC.reverse()) // why reverse ? so that the last edges (which correspond to walking) be displayed first (ie underneath) as to not perturb clicking.
		.enter().append("path").classed("lignes",1)
		.attr("d",function(d) {return d.path;})
		.style({
			"stroke-width":function(d) {return edgeScale(d.share);}, 
			"stroke-dasharray":function(d) {return (d.type==="marche")?"2 2":null;},
			stroke:function(d) {return e[d.id].active?d.color:"black";},
			opacity:function(d) {return (d.type==="marche")?0:1;}
		})
		.on("click",function(d) {
			//console.log("clicked on an edge")
			e[d.id].active=(!(e[d.id].active));
			if(e[d.id].reverse) {
				
				e[e[d.id].reverse].active=((e[d.id].active));
			} // if we are deactivating one edge, we mean to deactivate the edge in the opposite direction if it exists
			
			d3.select(this).style("stroke", e[d.id].active?d.color:"black");	// but if we are just coloring that edge, we can just recolor 1 edge, as opposed to the two of them. 
																				// the one edge that captures the click is on top, we need not recolor the one underneath.
																				// if we changed the graphical treatment we may have wanted to restyle both.
			edgesStart=d3.nest().key(function(d) {return d.start;}).map(e);
			//a=new Date();
			dist=calcDist(n,edgesStart,s);
			//console.log((new Date()-a)+" milliseconds");
			d3.selectAll(".staCircles").style({fill:function(d,i) {return timeScale(dist[i].avg);},stroke:"black"})
			reinit(geoCheck,n,e,s,v,s[selected],dist);
		})
	d3.selectAll(".lignes").append("title").text(function(d) {return (e[d.id].active?"actif":"désactivé")})
	var legend0=legend.append("g").attr({id:"legend0",transform:"translate(670,0)"});
	var onecolor=colors[d3.keys(colors)[Math.floor(Math.random()*(d3.keys(colors).length-1))]]
	legend0.selectAll("circle").data([[130,"white"],[150,"yellow"],[170,"red"]]).enter()
		.append("circle")
		.attr({cx:function(d) {return d[0]},cy:20,r:5})
		.style({"fill":function(d) {return d[1];},"stroke":"black"})
	legend0.selectAll("path").data([[125,5],[145,3],[165,1]]).enter()
		.append("path")
		.attr({d:function(d) {return "M"+d[0]+",40h10"}})
		.style({"stroke-width":function(d) {return d[1]},"stroke":onecolor})
	legend0.selectAll("actif").data([125,153]).enter()
		.append("path")
		.attr({d:function(d) {return "M"+d+",60h22"}})
		.style({"stroke-width":3,stroke:function(d,i) {return i?"black":onecolor;}})
		
	legend0.append("text").attr({y:25}).text("station").style("font-weight","bold");
	legend0.append("text").attr({y:25,x:60}).text("centrale")
	legend0.append("text").attr({y:25,x:190}).text("éloignée")
	legend0.append("text").attr({y:45}).text("ligne").style("font-weight","bold");
	legend0.append("text").attr({y:45,x:60}).text("chargée")
	legend0.append("text").attr({y:45,x:190}).text("peu fréquentée")
	legend0.append("text").attr({y:65}).text("tronçon").style("font-weight","bold");
	legend0.append("text").attr({y:65,x:60}).text("actif")
	legend0.append("text").attr({y:65,x:190}).text("désactivé")
	

	var legend1=legend.append("g").attr({id:"legend1",transform:"translate(670,0)","text-anchor":"end"}).style("opacity",0);
	legend1.append("text").attr({y:15,x:285}).text("Seuls les chemins les plus courts sont affichés.")
	legend1.append("text").attr({y:40,x:285}).text("Un anneau = 5 minutes de trajet")
	legend1.append("text").attr({x:215,y:65}).text("Marche")
	legend1.append("path").attr({d:"M285,65h-60"}).style({stroke:"#222","stroke-dasharray":"2 2"});





	if(location.hash) {
		selected=+location.hash.slice(1);
		repos(n,e,s,v,s[selected],dist)
	}
}

function reticulate(edges,stations) {
	// splines love reticulating
	edges.forEach(function(e) {
		e.p1=[stations[e.s1].projx,stations[e.s1].projy];
		e.p2=[stations[e.s2].projx,stations[e.s2].projy];
		if(!e.o1) {e.o1=e.p1;e.o2=e.p2; // original positions
		}
		e.path="M"+e.p1.join(",")+"L"+e.p2.join(",");
	})
}

function reinit(geoCheck,nodes,edges,stations,votes,s,dist) {
	stations.forEach(function(d) {
		if (geoCheck) {d.ox=d.geox;d.oy=d.geoy} else {d.ox=d.ratpx;d.oy=d.ratpy;} 
	})
	repos(nodes,edges,stations,votes,s,dist);
}

function present(seconds) {
	// this assumes that seconds is always over 120. 
	var s=Math.floor(seconds%60);
	var t=Math.floor(seconds/60)+" minutes "+(s?s+(s>1?" secondes":" seconde"):"")
	return t; 
}

function repos(nodes,edges,stations, votes,s, dist) {
	// reposition all the things
	debugE=edges;
	if(!s) {
		selected=-1;
		d3.select("h1").html("Plan interactif du métro").style("font-size",null)
		d3.select("em").html("Cliquez sur une station pour voir les temps de trajet, cliquez sur un tronçon pour le désactiver")
		stations.forEach(function(d) {
			d.projx=d.ox;
			d.projy=d.oy;
		})
		reticulate(edges,stations);
		d3.selectAll(".staCircles").on("mouseover",null);
		d3.selectAll(".staCircles").on("mouseout",null);
		backCircles.selectAll("*").transition().duration(1000).style("opacity",0).remove();
		d3.selectAll(".staCircles").transition().duration(1000).attr({cx:function(d) {return d.projx},cy:function(d) {return d.projy}}).style("opacity",1);
		d3.selectAll(".staLabels").transition().duration(1000).attr({x:function(d) {return d.projx+5},y:function(d) {return d.projy-5}}).style("visibility","hidden")
		d3.selectAll(".lignes").transition().duration(1000).attr("d",function(d) {return d.path;}).style({opacity:function(d) {return (d.type==="marche")?0:1;}})
		d3.select("#legend0").transition().style("opacity",1);
		d3.select("#legend1").transition().style("opacity",0);
		location.hash="";
		lowerPart();
		return undefined;
	} else {
		selected=s.station;
		location.hash="#"+selected;
		d3.select("#legend0").transition().style("opacity",0);
		d3.select("#legend1").transition().style("opacity",1);
		d3.select("h1").html(s.name).style("font-size",function() {if(s.name.length>25) {return "30px"} else {return "36px"}})
		d3.select("em").html("Temps de trajet moyen: "+present(dist[s.station].avg))
		var x0=s.ox,
			y0=s.oy,
			maxDist=d3.max(dist[s.station].distances.filter(function(d) {return d<100000;}));

		var distScale=d3.scale.linear().domain([0,maxDist]).range([0,400]);

		var solution=dist[s.station].edges.map(function(d) {return d.id;})

		stations.forEach(function(d) {
			if (d===s) {
				d.projx=(width/2);	// selected station will move to center
				d.projy=(height/2);
			} else {
				var x1=d.ox,	//	position of the other station
					y1=d.oy,	//
					mapDist=Math.sqrt((x0-x1)*(x0-x1)+(y0-y1)*(y0-y1)), // original distance as drawn on the map
					angle=((y1>y0)?1:-1)*Math.acos((x1-x0)/mapDist);
					time=distScale(dist[s.station].distances[d.station]); // time necessary for travel, scaled
					d.projx=(width/2)+Math.cos(angle)*time;
					d.projy=(height/2)+Math.sin(angle)*time;
			}
		})
		reticulate(edges,stations);

		d3.selectAll(".staCircles").transition().duration(1000).attr({cx:function(d) {return d.projx},cy:function(d) {return d.projy}}).style("opacity",1);
		d3.selectAll(".staLabels").transition().duration(1000).attr({x:function(d) {return d.projx+5},y:function(d) {return d.projy-5}})
		
		d3.selectAll(".lignes").transition().duration(1000).attr("d",function(d) {return d.path;})
			.style("opacity",function(d) {if (solution.indexOf(d.id)>-1) {return 1;} else {return 0;}})
		radii=d3.range(Math.ceil(maxDist/300)+1).reverse();
		backCircles.selectAll("circle").data(radii).enter().append("circle").attr({cx:width/2,cy:height/2}).style("fill","white");
		backCircles.selectAll("circle").data(radii).exit().remove();
		backCircles.selectAll("circle").transition().duration(1000).attr("r",function(d) {return distScale(d*300);})
		.style({
			stroke:function(d,i) {
			//	return d3.scale.linear().domain([0,5,15]).range(["white","yellow","red"])(d+3);
			//	return (i%2)?"#ccc":"#fff";
			return "#bbb"
			},
			fill:function(d,i) {
			//	return d3.scale.linear().domain([0,5,15]).range(["white","yellow","red"])(d);
				return (i%2)?"#ccc":"#fff";
			}
		})
		backCircles.on("click",function() {
			//console.log("clicked on a circle");
			repos(nodes,edges,stations)
		})

		d3.selectAll(".staCircles").on("mouseover", function(d) {

			// we reconstruct the path 

			var dest=d.main;
			var path=[];
			var corrs=[s.station,d.station];

			var myEdges=dist[s.station].edges;
			var edge=myEdges[dest];
			if(d.main!=s.main) {
			while(edge.start!=s.main) {
				path.push(edge.id);
				if(["correspondance","exit","entrance"].indexOf(edge.type)>-1) {
					corrs.push(edge.station);
				}
				edge=myEdges[edge.start];
			}
			//console.log(path);
			//console.log(corrs);
			corrs.forEach(function(corr) {
				d3.select("#l"+corr).style("visibility","visible");
			})
			d3.selectAll(".staCircles").filter(function(d) {return corrs.indexOf(d.station)<0;}).transition().style("opacity",0);
			d3.selectAll(".lignes").transition()
			//.duration(1000)
			.attr("d",function(d) {return d.path;}) // this is necessary to repeat b/c in case of accidental mouseover during transformation, the edges would stop moving
			.style("opacity",function(l) {
				if (solution.indexOf(l.id)>-1) { // edge to be displayed
					if(path.indexOf(l.id)>-1) {	// edge to be displayed AND in shortest path
						return 1;
					} else {
						return .1;	// edge not in shortest path from center to highlighted point
					}
				} else {return 0;}	// edge not to be displayed
			})}
			d3.select("em").html("Temps vers "+d.name+" : "+present(dist[s.station].distances[d.station]))

		})
		d3.selectAll(".staCircles").on("mouseout", function() {
			d3.selectAll(".staCircles").transition().duration(1000).style("opacity",1).attr({cx:function(d) {return d.projx},cy:function(d) {return d.projy}});
			d3.select("em").html("Temps de trajet moyen: "+present(dist[s.station].avg))
			d3.selectAll(".lignes").transition()
			.duration(1000)
			.attr("d",function(d) {return d.path;}) // ditto 
			.style("opacity",function(d) {if (solution.indexOf(d.id)>-1) {return 1;} else {return 0;}})
			d3.selectAll(".staLabels").style("visibility","hidden")
		})
		lowerPart(s,nodes,edges,stations,votes);
		return s;
	}	
}

function calcDist(nodes,edges,stations) {
	var dist=[];
	
	// running n dijkstras is much much faster than 1 floyd warhsall in that case.

	//dist=floydWarshall(nodes,edges,edgeArr); // o(n^3), exactly 314 896 769 cycles.
	//dist=dist.slice(381,680);
	//dist.forEach(function(d) {d=d.slice(381,680)})

	stations.forEach(function(s) {
		myDist=dijkstra(nodes,edges,s.main); // m log n, bitches. That's about 3 293 728 cycles. 100 x faster
		dist.push({distances:myDist.distances.slice(381,680),edges:myDist.edges,avg:d3.mean(myDist.distances)});	
	})

	return dist;
}

function floydWarshall(nodes,edges,edgeArr) {
	var a=[],b=[];

	n=nodes.map(function(v) {return v.node;})
	
	// initializing the array
	n.forEach(function(i) {
		a.push(n.map(function(j) {return (i==j)?0:Infinity;}));
	})

	edgeArr.forEach(function(e) {
		a[e.start][e.end]=e.length
	})
	//console.log("array initialized.")
	n.slice(1,n.length).forEach(function(k) {
		b=a.slice(0);
		//console.log(k);
		n.forEach(function(i) {
			n.forEach(function(j) {
				a[i][j]=d3.min([
					b[i][j], 
					b[i][k]+b[k][j]
				])
			})
		})
	})
	//console.log("done")
	return a;
}

function johnson(nodes,edges) {
	// untested.

	var n=nodes.length;
	var dist=[];
	var GprimeV=nodes.slice(0).push({node:n});
	var GprimeE=edges.slice(0);
	nodes.forEach(function(d) {GprimeE.push({start:n,end:d.node,length:0})})
	var GprimeEend=d3.nest().key(function(d) {return d.end;}).map(GprimeE);
	var p=bellmanFord(GprimeV,GprimeEend,n);
	Eprime=edges.map(function(e) { return {
		start:e.start,
		end:e.end,
		length:e.length+p[e.start]-p[e.end]
	}})
	var EprimeStart=d3.nest().key(function(d) {return d.start;}).map(Eprime);
	nodes.forEach(function(u) {
		myDist=dijkstra(nodes,EprimeStart,u.node);
		myDist.distances.forEach(function(d,v) { // note: supposes nodes are 0,1,2,3,...,n
			d=d-p[u.node]+p[v];
		})
	 })
}

function bellmanFord(nodes,edges,s) {
	var n=nodes.length;
	var a=d3.range(n).map(function() {return Infinity;});
	a[s]=0;
	b=a.slice(0);
	d3.range(1,n).forEach(function(i) {
		d3.range(0,n).forEach(function(v) {
			a[v]=b[v];
			edges[v].forEach(function(e) {
				if(b[e.start]+e.length<a[v]) {a[v]=b[e.start]+e.length}
			})
		})
		b=a.slice(0)
	})
	return a;
}

function dijkstra(nodes,edges,s) {
	var dist=d3.range(nodes.length).map(function() {return Infinity;})
 	var backtrack=[];

 	dist[s]=0;
 	var Q=new BinaryHeap(function(v) {return dist[v];})

 	nodes.forEach(function(v) {Q.push(+v.node);})
 	var breakloop=false;
 	while (Q.size&&!breakloop) {
 		var u=Q.pop(),du=dist[u];
 		if(du===Infinity||!Q.size()) {
 			breakloop=true;
 		} else {
 			edges[u].forEach(function(e) {
 				//if(!e.active) {console.log(e);}
				var alt=du+(e.active?e.length:100000); // arbitrarily large. 
				var v=+e.end;
				if(alt<dist[v]) {
 					Q.remove(v);
 					dist[v]=alt;
 					backtrack[v]=e;
 					Q.push(v);
 				}
 			
 			})
 			//console.log(Q.size());
 		}
 	}
 	return {distances:dist,edges:backtrack};
}

function areaPoly(arr) {
	var area=0;
	var n=arr.length;
	var j=n-1;
	arr.forEach(function(p,i) {
		var x0=p[0],y0=p[1],q=arr[j],x1=q[0],y1=q[1];
		area=area+(x0+x1)*(y1-y0);j=i;
	})
	return area/2;
}

function lowerPart(station,nodes,edges,stations,votes) {
	//console.log(station);
	if(!station) {d3.select("#r4").style("display","none"); return true;}
	d3.select("#r4").style("display","block");
	d3.select("#lowerName").html(station.name);
	//console.log(station.corr)
	d3.select("#correspondances").style("display",((+station.corr)?"block":"none"));
	var rectScale=d3.scale.linear().domain([120,420]).range([0,250])
	var edgesS=[];
	var edgesC=[];
	edges.forEach(function(e) {
		if (+e.station===+station.station) {
			if(e.type==="entrance") {
				edgesS.push(e);
			}
			if(e.type==="correspondance" && (+e.start<+e.end)) {
				edgesC.push(e);
			}
		}
	})
	//console.log(edgesS,edgesC)
	d3.select("#slegend").html("&nbsp;");d3.select("#clegend").html("&nbsp;");
	liS=d3.select("#sortie").selectAll("li").data(edgesS);
		liS.enter().append("li");
		liS.exit().remove();
	liS=d3.select("#sortie").selectAll("li").html("");
	liSSVG=liS.append("div").append("svg").attr({width:350,height:24});
	liSSVG.append("rect").attr({height:24,rx:3,ry:3,width:36}).style("fill",function(d) {return colors[nodes[d.end].ligne]});
	liSSVG.append("text").attr({x:18,"text-anchor":"middle",y:18}).text(function(d) {return nodes[d.end].ligne});
	liSSVGg=liSSVG.append("g").attr({transform:"translate(45,0)"});
	liSSVGg.append("rect").attr({width:254,rx:4,ry:4,height:20,y:2,id:function(d,i) {return "rv"+i;}}).style({fill:"#eee",stroke:"black","stroke-width":2});
	liSSVGg.selectAll("path").data(d3.range(4)).enter().append("path").attr("d",function(d) {return "M"+(50*(d+1))+",2v20";}).style({"stroke":"#bbb","stroke-dasharray":"4 4"})
	liSSVGg.append("rect").attr({y:6,x:1,height:4,width:function(d) {return rectScale(d.length);}}).style({fill:"red",stroke:"none"}).classed("avg",1)
	liSSVGg.append("rect").attr({y:14,x:1,height:4,width:0,id:function(d,i) {return "u"+i;}}).style({fill:"blue",stroke:"none"}).classed("user",1)
	liSSVGg.append("rect").attr({width:250,x:2,y:2,height:20}).style({fill:"white",opacity:.0001,stroke:"none"}).classed("vote",1)
	
	liC=d3.select("#correspondance").selectAll("li").data(edgesC);
		liC.enter().append("li");
		liC.exit().remove()
	liC=d3.select("#correspondance").selectAll("li").html("");
	liCSVG=liC.append("div").append("svg").attr({width:350,height:24})
	liCSVG.append("rect").attr({height:24,rx:3,ry:3,width:36}).style("fill",function(d) {return colors[nodes[d.start].ligne]});
	liCSVG.append("text").attr({x:18,"text-anchor":"middle",y:18}).text(function(d) {return nodes[d.start].ligne});
	liCSVG.append("rect").attr({x:45,height:24,rx:3,ry:3,width:36}).style("fill",function(d) {return colors[nodes[d.end].ligne]});
	liCSVG.append("text").attr({x:63,"text-anchor":"middle",y:18}).text(function(d) {return nodes[d.end].ligne});
	liCSVGg=liCSVG.append("g").attr({transform:"translate(90,0)"});
	liCSVGg.append("rect").attr({width:254,rx:4,ry:4,height:20,y:2,id:function(d,i) {return "rv"+(i+edgesS.length);}}).style({fill:"#eee",stroke:"black","stroke-width":2});
	liCSVGg.selectAll("path").data(d3.range(4)).enter().append("path").attr("d",function(d) {return "M"+(50*(d+1))+",2v20";}).style({"stroke":"#bbb","stroke-dasharray":"4 4"})
	liCSVGg.append("rect").attr({y:6,x:1,height:4,width:function(d) {return rectScale(d.length);}}).style({fill:"red",stroke:"none"}).classed("avg",1)
	liCSVGg.append("rect").attr({y:14,x:1,height:4,width:0,id:function(d,i) {return "u"+(i+edgesS.length);}}).style({fill:"blue",stroke:"none"}).classed("user",1)
	liCSVGg.append("rect").attr({width:250,x:2,y:2,height:20}).style({fill:"white",opacity:.0001,stroke:"none"}).classed("vote",1)

	d3.selectAll(".vote").on("mousemove",function(d,i) {
		if(!d.voted) {
			var event=d3.event;
			var p,cont;
			//console.log(event);
			var w=d3.min([250,event.offsetX-(i<edgesS.length?45:90)]);

			if(i<edgesS.length) {
				p=["On rentre sur le quai !","Un escalier, un couloir...","Station normale","Assez loin de l'entrée","Voyage au centre de la terre"];
				cont="#slegend";
			} else {
				p=["Les quais sont à côté !","Très rapide","Quelques couloirs","On doit pas mal marcher","Un vrai dédale"];
				cont="#clegend";
			}
			d3.select(cont).html(p[Math.floor(w/52)]);
			d3.select("#u"+i).attr("width",w);
		}
	})

	d3.selectAll(".vote").on("mouseout",function() {
		d3.select("#slegend").html("&nbsp;");d3.select("#clegend").html("&nbsp;");
	})

	d3.selectAll(".vote").on("click",function(d,i) {
		//console.log("clicked to vote");
		d.voted=true;
		var value=d3.select("#u"+i).attr("width")/2.5;
		d3.select("#u"+i).style("fill","green")
		d3.select("#rv"+i).style({stroke:"#bbb","stroke-width":1})
		d3.json("readvote.php?edge="+d.id,function(error,json) {

			vote=json.values[0].value;
			//console.log("reading vote "+d.id+": ",vote.value,vote.voters);
			newVoters=+vote.voters+1;
			newValue=(vote.voters*vote.value+value)/newVoters;

			d3.xhr("vote.php?edge="+d.id+"&value="+newValue+"&voters="+newVoters,function(error,json) {
				console.log("updated",d.id,newValue,newVoters);
			})
		})
	})
}

function computeDistance(stations,edges) {
	n=edges.length;
	var r=6367445;
	stations.forEach(function(a) {
		myDist=[
			{station:a,distance:Infinity},
			{station:a,distance:Infinity},
			{station:a,distance:Infinity},
			{station:a,distance:Infinity},
			{station:a,distance:Infinity}
		];
		
		stations.forEach(function(b) {if(a!=b) {
			distance=r*distll(a,b);
			if(distance<d3.max(myDist,function(d) {return d.distance})) {
				myDist=myDist.slice(1);
				myDist.push({station:b,distance:distance});
				myDist.sort(function(a,b) {return b.distance-a.distance;})
			}}
		})
		myDist.forEach(function(b) {
			edges.push({
			start:a.main,
			end:b.station.main,
			length:b.distance*1.2, // assuming 1 km in 20 mins.
			type:"marche"})
		})
	})
}

function distll(s1,s2) {
	var acos=Math.acos,cos=Math.cos,sin=Math.sin,π=Math.PI;
	var a=s1.lat*π/180;b=s2.lat*π/180;c=s1.lon*π/180;d=s2.lon*π/180;

	return acos(sin(a)*sin(b)+cos(a)*cos(b)*cos(c-d));
}
