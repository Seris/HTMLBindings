;"use strict";

var htmlbindings = {};

(function(){
    // Helpers
    var $ = document.querySelector.bind(document),
        $$ = document.querySelectorAll.bind(document);

    var gControllers = {};

    htmlbindings.gControllers = gControllers;

    /*==========  HTML Parsing  ==========*/
    window.addEventListener("load", function(){
        var doms = $$("[hb-controller]");

        for (var i = doms.length - 1; i >= 0; i--) {
            var ctrlName = doms[i].getAttribute("hb-controller");
            init_controller(ctrlName, doms[i]);
        }
    });



    /*==========  Controller Management  ==========*/
    /**
     * Create a controller - Client Side
     * @param  {string}
     * @param  {function}
     */ 
    htmlbindings.controller = function(name, controller){
        if(gControllers[name])
            throw new Error("Controller already exist");

        gControllers[name] = new Controller(controller);
    };

    function init_controller(ctrlName, dom){
        if(!gControllers[ctrlName]){
            _throw("ControllerNotFound", ctrlName);
        }

        gControllers[ctrlName].initTemplateFrom(dom);
        gControllers[ctrlName].exec();
    }


    /*==========  Controller  ==========*/
    function Controller(controller){
        this.controller = controller;
        this.scope = {};

        this.variables = {};
        this.repeats = [];
    }

    Controller.prototype.initVariable = function(variable){
        if(!this.variables[variable]){
            this.variables[variable] = [];
        }
    };

    Controller.prototype.getVariable = function(variableStr){
        var path = variableStr.split("."), variable = this.scope;
        try {
            for (var i = 0; i < path.length; i++) {
                variable = variable[path[i]];
            }
        } catch(e){
            return undefined;
        }

        return variable;
    };

    Controller.prototype.makeSafeForDisplay = function(variable){
        if(variable === undefined
            || variable === null){
            variable = "";
        }

        return variable;
    }

    Controller.prototype.initTemplateFrom = function(ctrlElement){
        this.ctrlElement = ctrlElement;
        this.initTemplateOnNode(ctrlElement);

    };

    Controller.prototype.initTemplateOnNode = function(element){
        var hbattribute = element.getAttribute("hb-repeat");
        if(!hbattribute){
            var childs = [], variables;
            mergeArray(childs, element.childNodes);

            for (var i = 0; i < childs.length; i++) {
                if(typeof childs[i].wholeText === "string"){
                    this.initTemplateOnText(childs[i]);
                } else {
                    this.initTemplateOnNode(childs[i]);
                }
            }
        } else {
            this.initRepeatTemplateOnNode(element, hbattribute);
        }
    };

    Controller.prototype.initTemplateOnText = function(text){
        variables = Controller.getVariablesTextReferencesFromText(text);

        for(var variable in variables){
            this.initVariable(variable);
            mergeObject(
                this.variables[variable],
                variables[variable]);
        }
    };

    Controller.prototype.initRepeatTemplateOnNode = function(element, repeat){
        var repeatVariable = repeat.match(Controller.HB_REPEATS_REG);
        if(!repeatVariable){
            _throw("InvalidHBRepeat", repeat);
        }

        var nextElement;
        for (var i = 0; i < element.parentNode.childNodes.length; i++) {
            if(element.parentNode.childNodes[i] === element){
                nextElement = element.parentNode.childNodes[i+1] || null;
            }
        }

        var repeat = {
            dst: repeatVariable[1],
            src: repeatVariable[2],
            parent: element.parentNode,
            nextElement: nextElement,
            tree: element.cloneNode(true),
            variables: {},
            elements: []
        };

        repeat.tree.removeAttribute("hb-repeat");

        var texts = Controller._getAllTexts(repeat.tree), variables;
        for (var i = 0; i < texts.length; i++) {
            variables = Controller.getVariablesTextReferencesFromText(texts[i]);
            for (var variable in variables) {
                if(!repeat.variables[variable]){
                    repeat.variables[variable] = [];
                }

                repeat.variables[variable] = variables[variable];
            }
        }

        this.repeats.push(repeat);
        element.parentNode.removeChild(element);
    };

    Controller.prototype.applyTemplate = function(){
        for(var variable in this.variables){
            repeats = this.variables[variable].repeats;

            var data = this.makeSafeForDisplay(this.getVariable(variable));

            var textElements = this.variables[variable];
            for (var i = 0; i < textElements.length; i++) {
                textElements[i].textContent = data;
            }
        }

        for (var i = 0; i < this.repeats.length; i++) {
            this.applyRepeatTemplate(this.repeats[i]);
        }
    };

    Controller.prototype.applyRepeatTemplate = function(repeat){
        for (var i = 0; i < repeat.elements.length; i++) {
            repeat.elements[i].parentNode.removeChild(repeat.elements[i]);
        }
        repeat.elements = [];


        var src = this.getVariable(repeat.src);
        if(!src instanceof Array){
            return;
        }

        var dsts = {};
        for(var variable in repeat.variables){
            if(variable.indexOf(repeat.dst) === 0){
                var name = variable.substr(repeat.dst.length);
                dsts[name] = repeat.variables[variable];
            }
        }

        for (var i = 0; i < src.length; i++) {
            for(var variable in dsts){
                var dst = variable.split("."), data = src[i];
                dst.shift();

                for (var j = 0; j < dst.length; j++) {
                    data = data[dst[j]];
                }

                data = this.makeSafeForDisplay(data);
                for (var j = 0; j < dsts[variable].length; j++) {
                    dsts[variable][j].textContent = data;
                }
            }

            repeat.parent.appendChild(repeat.tree.cloneNode(true));
        }
    };

    Controller.prototype.getPublicScopeInterface = function() {
        var public_scope = {};
        public_scope.$apply = Controller.publicScopeApply.bind({
            public_scope: public_scope,
            controller: this
        });

        public_scope.$binded = true;
        return public_scope;
    };

    Controller.prototype.exec = function(){
        var public_scope = this.getPublicScopeInterface();
        this.controller(public_scope);
        public_scope.$apply();

        this.applyTemplate();
    };

    Controller._getAllTexts = function(element){
        if(element.childNodes.length > 0){
            var texts = [];
            for (var i = 0; i < element.childNodes.length; i++) {
                if(typeof element.childNodes[i].wholeText === "string"){
                    texts.push(element.childNodes[i]);
                } else {
                    mergeArray(
                        texts,
                        Controller._getAllTexts(element.childNodes[i]));
                }
            }

            return texts;
        } else {
            return [];
        }
    };

    Controller.getVariablesTextReferencesFromText = function(text, noClean){
        var variables = text.textContent.match(Controller.VAR_REG), nodes = {};

        if(variables){
            var last = text, varText, variable;
            for (var i = 0; i < variables.length; i++) {
                var index = last.textContent.indexOf(variables[i]);
                if(index < last.textContent.length){
                    varText = last.splitText(index);
                    last = varText.splitText(variables[i].length);

                    variable = varText.textContent.match(
                        Controller.VAR_CTN_REG)[1];

                    if(!nodes[variable])
                        nodes[variable] = [];

                    nodes[variable].push(varText);
                    if(!noClean){
                        varText.textContent = "";
                    }
                }
            }
        }

        return nodes;
    };

    Controller.publicScopeApply = function(){
        delete this.public_scope.$apply;

        mergeObject(this.controller.scope, this.public_scope);
        for(var item in this.public_scope){
            if(this.public_scope.hasOwnProperty(item)){
                delete this.public_scope[item];
            }
        }

        this.public_scope.$binded = false;
    };

    Controller.VAR_REG = /\{\{?\s[a-z0-9?\.]*?\s\}\}/gi;
    Controller.VAR_CTN_REG = /\{\{?\s([a-z0-9?\.]*)?\s\}\}/i;
    Controller.HB_REPEATS_REG = /([a-z0-9?\.]*) in ([a-z0-9?\.]*)/i;


    /*==========  Miscellaneous  ==========*/
    function mergeObject(obj1, obj2){
        for (var item in obj2) {
            if(obj2.hasOwnProperty(item)){
                if(obj2[item] !== null
                    && typeof obj1[item] === "object"
                    && typeof obj2[item] === "object"){
                    mergeObject(obj1[item], obj2[item]);
                } else {
                    obj1[item] = obj2[item];
                }
            }
        }
    }

    function mergeArray(arr1, arr2){
        for (var i = 0; i < arr2.length; i++) {
            arr1.push(arr2[i]);
        }
    }


    /*==========  Error Management  ==========*/
    function _throw(type, payload){
        var error;
        try {
            error = new gErrors[type](payload);
        } catch(e){
            error = new gErrors["NotFoundError"](type);
        }

        htmlbindings.current_error = {
            type: type,
            err: error
        };

        console.error("HTMLBindings Error - %s - %s\n%s",
            type,
            error.message,
            stackTrace());

        throw new Error("HTMLBindings Error");
    }

    var gErrors = {
        ControllerNotFound: function(ctrlName){
            this.ctrlName = ctrlName;
            this.message = "Controller '" + ctrlName + "' doesn't exist";
        },

        InvalidVariable: function(variable){
            this.variable = variable;
            this.message = "Variable {" + variable.join(".") + "} doesn't exist";
        },

        InvalidHBRepeat: function(repeat){
            this.repeat = repeat;
            this.message = '"' + repeat + '" is an invalid input for hb-repeat';
        },

        NotFoundError: function(error){
            this.error = error;
            this.message = "Error '" + error + "' not found";
        }
    };

    function stackTrace() {
        var stack = new Error().stack.split("\n");
        if(stack[0] === "Error") stack.shift();
        stack.shift();
        return stack.join("\n");
    }

})();