var htmlbindings = {};

(function () {
    "use strict";

    // Helpers
    var $ = document.querySelector.bind(document),
        $$ = document.querySelectorAll.bind(document),
        gControllers = {};

    htmlbindings.currentError = null;

    /*==========  Controller Management  ==========*/
    /**
     * Create a controller - Client Side
     * @param  {string}
     * @param  {function}
     */ 
    htmlbindings.controller = function (ctrlName, controller) {
        if (gControllers[ctrlName]){
            _throw("ControllerAlreadyExist", ctrlName);
        }

        gControllers[ctrlName] = new Controller(controller);
    };

    htmlbindings.getControllerScope = function(ctrlName){
        if (!gControllers[ctrlName]){
            _throw("ControllerNotFound", ctrlName);
        }

        return gControllers[ctrlName].getPublicScopeInterface();
    }

    function init_controller(ctrlName, dom) {
        if (!gControllers[ctrlName]) {
            _throw("ControllerNotFound", ctrlName);
        }

        gControllers[ctrlName].initTemplateFrom(dom);
        gControllers[ctrlName].exec();
    }


    /*==========  Controller  ==========*/
    function Controller(controller) {
        this.controller = controller;
        this.scope = {};

        this.variables = {};
        this.repeats = [];
    }

    Controller.prototype.initVariable = function (variable) {
        if (!this.variables[variable]) {
            this.variables[variable] = [];
        }
    };

    Controller.getVariableFrom = function (variableStr, scope) {
        var path = variableStr.split("."), variable = scope, i;
        for (i = 0; i < path.length; i++) {
            if (variable instanceof Object) {
                variable = variable[path[i]];
            } else {
                return undefined;
            }
        }

        return variable;
    };

    Controller.makeSafeForDisplay = function (variable) {
        if (variable === undefined
            || variable === null) {
            variable = "";
        }

        return variable;
    };

    Controller.prototype.initTemplateFrom = function (ctrlElement) {
        this.ctrlElement = ctrlElement;
        this.initTemplateOnNode(ctrlElement);

    };

    Controller.prototype.initTemplateOnNode = function (element) {
        var hbattribute = element.getAttribute("hb-repeat"),
            childs = [], i;

        if (!hbattribute) {
            mergeArray(childs, element.childNodes);

            for (i = 0; i < childs.length; i++) {
                if (typeof childs[i].wholeText === "string") {
                    this.initTemplateOnText(childs[i]);
                } else {
                    this.initTemplateOnNode(childs[i]);
                }
            }
        } else {
            this.initRepeatTemplateOnNode(element, hbattribute);
        }
    };

    Controller.prototype.initTemplateOnText = function (text) {
        var variables = Controller.getVariablesTextReferencesFromText(text),
            variable;

        for(variable in variables) {
            this.initVariable(variable);
            mergeObject(
                this.variables[variable],
                variables[variable]);
        }
    };

    Controller.prototype.initRepeatTemplateOnNode = function (element, repeat) {
        var repeatVariable = repeat.match(Controller.HB_REPEATS_REG),
            nextElement, i, variable, texts, variables;

        if (!repeatVariable) {
            _throw("InvalidHBRepeat", repeat);
        }

        for (i = 0; i < element.parentNode.childNodes.length; i++) {
            if (element.parentNode.childNodes[i] === element) {
                nextElement = element.parentNode.childNodes[i+1] || null;
            }
        }

        repeat = {
            dst: repeatVariable[1],
            src: repeatVariable[2],
            parent: element.parentNode,
            nextElement: nextElement,
            tree: element.cloneNode(true),
            variables: {},
            elements: []
        };

        repeat.tree.removeAttribute("hb-repeat");

        texts = Controller._getAllTexts(repeat.tree);
        for (i = 0; i < texts.length; i++) {
            variables = Controller.getVariablesTextReferencesFromText(texts[i]);
            for (variable in variables) {
                if (!repeat.variables[variable]) {
                    repeat.variables[variable] = [];
                }

                repeat.variables[variable] = variables[variable];
            }
        }

        this.repeats.push(repeat);
        element.parentNode.removeChild(element);
    };

    Controller.prototype.applyTemplate = function () {
        var i, variable, data, textElements, repeats;
        for(variable in this.variables) {
            repeats = this.variables[variable].repeats;

            data = Controller.makeSafeForDisplay(
                Controller.getVariableFrom(variable, this.scope));

            textElements = this.variables[variable];
            for (i = 0; i < textElements.length; i++) {
                textElements[i].textContent = data;
            }
        }

        for (i = 0; i < this.repeats.length; i++) {
            this.applyRepeatTemplate(this.repeats[i]);
        }
    };

    Controller.prototype.applyRepeatTemplate = function (repeat) {
        var i, j, src, dsts, variable, data, toInject;
        for (i = 0; i < repeat.elements.length; i++) {
            repeat.elements[i].parentNode.removeChild(repeat.elements[i]);
        }
        repeat.elements = [];


        src = Controller.getVariableFrom(repeat.src, this.scope);
        if (!src instanceof Array) {
            return;
        }

        dsts = {};
        for(variable in repeat.variables) {
            if (variable.indexOf(repeat.dst) === 0) {
                name = variable.substr(repeat.dst.length+1);
                dsts[name] = repeat.variables[variable];
            }
        }

        for (i = 0; i < src.length; i++) {
            for(variable in dsts) {
                if (variable.length > 0) {
                    data = Controller.getVariableFrom(variable, src[i]);
                } else {
                    data = src[i];
                }
                
                data = Controller.makeSafeForDisplay(data);
                for (j = 0; j < dsts[variable].length; j++) {
                    dsts[variable][j].textContent = data;
                }
            }

            toInject = repeat.tree.cloneNode(true);
            repeat.parent.appendChild(toInject);

            repeat.elements.push(toInject);
        }
    };

    Controller.prototype.getPublicScopeInterface = function ()  {
        var public_scope = copyObject(this.scope);
        public_scope.$apply = Controller.publicScopeApply.bind({
            public_scope: public_scope,
            controller: this
        });
        return public_scope;
    };

    Controller.publicScopeApply = function () {
        var $apply = this.public_scope.$apply;
        delete this.public_scope.$apply;

        mergeObject(this.controller.scope, this.public_scope);
        this.controller.applyTemplate();

        this.public_scope.$apply = $apply;
    };

    Controller.prototype.exec = function () {
        var public_scope = this.getPublicScopeInterface(), item;
        this.controller(public_scope);
        public_scope.$apply();

        for (item in public_scope){
            delete public_scope[item];
        }
    };

    Controller._getAllTexts = function (element) {
        var i, texts = [];
        if (element.childNodes.length > 0) {
            for (i = 0; i < element.childNodes.length; i++) {
                if (typeof element.childNodes[i].wholeText === "string") {
                    texts.push(element.childNodes[i]);
                } else {
                    mergeArray(
                        texts,
                        Controller._getAllTexts(element.childNodes[i]));
                }
            }

            return texts;
        }
        
        return [];
    };

    Controller.getVariablesTextReferencesFromText = function (text, noClean) {
        var variables = text.textContent.match(Controller.VAR_REG),
            nodes = {}, i, last = text, varText, variable, index;

        if (variables) {
            for (i = 0; i < variables.length; i++) {
                index = last.textContent.indexOf(variables[i]);
                if (index < last.textContent.length){
                    varText = last.splitText(index);
                    last = varText.splitText(variables[i].length);

                    variable = varText.textContent.match(
                        Controller.VAR_CTN_REG)[1];

                    if (!nodes[variable]){
                        nodes[variable] = [];
                    }

                    nodes[variable].push(varText);
                    if (!noClean){
                        varText.textContent = "";
                    }
                }
            }
        }

        return nodes;
    };

    Controller.VAR_REG = /\{\{?\s[a-z0-9?\.]*?\s\}\}/gi;
    Controller.VAR_CTN_REG = /\{\{?\s([a-z0-9?\.]*)?\s\}\}/i;
    Controller.HB_REPEATS_REG = /([a-z0-9?\.]*) in ([a-z0-9?\.]*)/i;


    /*==========  Miscellaneous  ==========*/
    function copyObject(obj){
        var item, copy = {};
        for (item in obj) {
            if (obj.hasOwnProperty(item)){
                if (obj[item] !== null
                    && typeof obj[item] === "object"){
                    copy[item] = copyObject(obj[item]);
                } else {
                    copy[item] = obj[item];
                }
            }
        }

        return copy;
    }

    function mergeObject(obj1, obj2){
        var item;
        for (item in obj2) {
            if (obj2.hasOwnProperty(item)){
                if (obj2[item] !== null
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
        var i;
        for (i = 0; i < arr2.length; i++) {
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

        htmlbindings.currentError = {
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
        ControllerAlreadyExist: function (ctrlName) {
            this.ctrlName = ctrlName;
            this.message = "Controller '" + ctrlName + "' already exist";
        },

        ControllerNotFound: function (ctrlName) {
            this.ctrlName = ctrlName;
            this.message = "Controller '" + ctrlName + "' doesn't exist";
        },

        InvalidVariable: function (variable) {
            this.variable = variable;
            this.message = "Variable {" + variable.join(".") + "} doesn't exist";
        },

        InvalidHBRepeat: function (repeat) {
            this.repeat = repeat;
            this.message = '"' + repeat + '" is an invalid input for hb-repeat';
        },

        NotFoundError: function (error) {
            this.error = error;
            this.message = "Error '" + error + "' not found";
        }
    };

    function stackTrace() {
        var stack = new Error().stack.split("\n");
        if (stack[0] === "Error"){
            stack.shift();
        }
        stack.shift();
        return stack.join("\n");
    }



    /*==========  HTML Parsing  ==========*/
    window.addEventListener("load", function () {
        var doms = $$("[hb-controller]"), i, ctrlName;

        for (i = doms.length - 1; i >= 0; i--) {
            ctrlName = doms[i].getAttribute("hb-controller");
            init_controller(ctrlName, doms[i]);
        }
    });

})();